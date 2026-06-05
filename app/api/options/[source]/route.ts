import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { getActiveForExecution } from "@/repositories/integrations";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { getOptionsResolver } from "@/services/options/_registry";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import { decideOptionsCredential } from "@/services/options/credentialPolicy";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { resolveEffectiveNodeOwner } from "@/services/teamCredentials/nodeCredentialOwners";
import { runWithCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";
import {
  OptionsResolverError,
  type OptionsSourceErrorCode,
  type OptionsSourceResponse,
  type WorkflowCreatorContext,
} from "@/services/options/types";

/**
 * GET /api/options/[source] — async options-source endpoint.
 *
 * Slice 3.30 foundation. Plan reference:
 * docs/slices/phase-3/options-source-plan.md §4.
 *
 * Stable discriminated body:
 *   { ok: true,  source, items, hasMore }
 *   { ok: false, source, code, message, missingDependency? }
 *
 * Status codes:
 *   - 401 for `UNAUTHENTICATED` (matches `requireUser()` contract).
 *   - 200 for every other code — the body's `ok: false` + `code` is
 *     the load-bearing signal. The client uses `code` to branch, not
 *     status; this matches the discovery API convention (a missing
 *     provider returns 404 there, but here the analog is "source
 *     unknown" which deserves a typed body to drive picker UX rather
 *     than swallowing a 404).
 *
 * Query string:
 *   - `q` — trimmed search query (max 256 chars; clamped). Empty
 *     string when absent.
 *   - `deps[<parentField>]` — dependsOn parent values. Multiple
 *     parents supported (e.g. `?deps[baseId]=foo&deps[tableId]=bar`).
 *     Empty / whitespace-only values count as missing.
 *   - `workflowId` — optional (Slice 4.ACCOUNT-MODEL-22D-1). When
 *     present and resolvable, the route reads the workflow's
 *     `created_by_user_id` and threads it to the resolver as
 *     `ctx.workflowCreator`. PLUMBING ONLY — provenance for the later
 *     22D-2 credential-policy slice. It does NOT change the integration
 *     lookup (still the caller's personal account) or any other
 *     behavior in this slice; an absent / unresolvable value is a no-op.
 *
 * Security:
 *   - No token leakage in `message`. No raw provider response bodies.
 *     Resolvers throw `OptionsResolverError` with caller-friendly
 *     sanitized strings.
 *   - `requireUser()` short-circuits on no session.
 *   - When `resolver.requiresIntegration === true`, the active
 *     integration is looked up via the service-role-backed
 *     `getActiveForExecution`. The account + provenance pin follow the
 *     22D-2 credential-sharing policy (`decideOptionsCredential`): no
 *     workflow context → editor's personal account; account provider →
 *     workflow account, shared; personal provider → workflow account
 *     pinned to the creator, creator-only (`NOT_WORKFLOW_OWNER` /
 *     `OWNER_MUST_CONNECT`). A non-creator editor triggers NO lookup, so
 *     a co-member's personal credential is never fetched. Missing →
 *     `INTEGRATION_DISCONNECTED` (or `OWNER_MUST_CONNECT` for the creator).
 *
 * The route deliberately does NOT cache. Each request fans out to the
 * resolver. v1 scope.
 */

const MAX_QUERY_LENGTH = 256;

interface ErrorBody {
  source: string;
  code: OptionsSourceErrorCode;
  message: string;
  missingDependency?: string;
}

function errorResponse(body: ErrorBody, status = 200): Response {
  const payload: OptionsSourceResponse = {
    ok: false,
    source: body.source,
    code: body.code,
    message: body.message,
    ...(body.missingDependency !== undefined && {
      missingDependency: body.missingDependency,
    }),
  };
  return NextResponse.json(payload, { status });
}

/**
 * Extract `deps[<parent>]` query params into a record. Empty /
 * whitespace-only values are dropped so the resolver's
 * `requiredDeps` check sees them as missing. Multiple values for the
 * same parent are not supported in v1 (the route uses the first
 * occurrence the `URLSearchParams` iterator returns, which mirrors
 * Express / Next default behavior).
 */
function extractDeps(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^deps\[([^\]]+)\]$/);
    if (!match) continue;
    const parent = match[1]!;
    if (out[parent] !== undefined) continue; // first occurrence wins
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    out[parent] = trimmed;
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { source: rawSource } = await params;
  // Next.js URL-decodes the `[source]` segment, so `slack%3Achannels`
  // arrives as `slack:channels`. No additional decode pass needed.
  const source = rawSource;

  const resolver = getOptionsResolver(source);
  if (!resolver) {
    return errorResponse({
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown options source '${source}'.`,
    });
  }

  // Parse query string.
  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q") ?? "";
  const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH);
  const deps = extractDeps(url.searchParams);
  const workflowId = url.searchParams.get("workflowId");
  // CS-4 — the node being configured. Threaded so the server can resolve an
  // ACCEPTED per-node credential owner; client-supplied owner identity is never
  // trusted (the owner is read from workflow_node_credentials, not the request).
  const nodeId = url.searchParams.get("nodeId");

  // Required-deps check happens BEFORE integration lookup so a missing
  // parent never costs an integration DB query.
  if (resolver.requiredDeps) {
    for (const required of resolver.requiredDeps) {
      if (deps[required] === undefined) {
        return errorResponse({
          source,
          code: "MISSING_DEPENDENCY",
          message: `Required dependsOn field '${required}' is missing.`,
          missingDependency: required,
        });
      }
    }
  }

  // Workflow-creator provenance (Slice 4.ACCOUNT-MODEL-22D-1). Best-effort,
  // never throws. Drives the credential-sharing decision below (22D-2).
  let workflowCreator: WorkflowCreatorContext | null = null;
  if (workflowId !== null) {
    workflowCreator = await resolveWorkflowCreatorContext(workflowId);
  }

  // Integration lookup (only when the resolver declares it required), governed
  // by the 22D-2 credential-sharing policy:
  //   - no workflow context → editor's personal account (safe legacy behavior);
  //   - account provider     → the workflow's account, account-shared;
  //   - personal + creator   → the workflow's account, PINNED to the creator;
  //   - personal + non-owner → NOT_WORKFLOW_OWNER (no lookup, no provider fetch).
  // For the pinned case, `pinUserId` also feeds the 22B credential-resolution
  // context so `refreshAndRetry`-style resolvers re-resolve with the same pin.
  let integration = null;
  let pinUserId: string | null = null;
  if (resolver.requiresIntegration) {
    // CS-4 — for a PERSONAL provider on a team workflow, resolve the accepted
    // per-node credential owner (flag-gated; null when OFF, no nodeId, or no
    // accepted grant — and NO DB lookup for account/service providers). It
    // overrides the creator as the effective owner in the decision below.
    let effectiveOwnerUserId: string | null = null;
    if (
      workflowCreator !== null &&
      nodeId !== null &&
      credentialSharingForProvider(resolver.provider) === "personal"
    ) {
      effectiveOwnerUserId = await resolveEffectiveNodeOwner(
        workflowCreator.workflowId,
        nodeId,
      );
    }

    const decision = decideOptionsCredential(
      resolver.provider,
      auth.userId,
      workflowCreator,
      effectiveOwnerUserId,
    );

    if (decision.kind === "not-owner") {
      // No resolver call, no getActiveForExecution call — the creator's
      // personal credential / resource labels are never fetched.
      return errorResponse({
        source,
        code: "NOT_WORKFLOW_OWNER",
        message: `This step runs under the workflow owner's ${resolver.provider} connection. Ask the owner to set it up.`,
      });
    }

    try {
      if (decision.kind === "legacy") {
        const ownerAccount = await ensurePersonalAccount(auth.userId);
        integration = await getActiveForExecution(
          ownerAccount.id,
          resolver.provider,
          null,
        );
      } else if (decision.kind === "account") {
        integration = await getActiveForExecution(
          decision.accountId,
          resolver.provider,
          null,
        );
      } else {
        // personal-creator — pin the lookup to the creator's connection.
        pinUserId = decision.connectedByUserId;
        integration = await getActiveForExecution(
          decision.accountId,
          resolver.provider,
          null,
          { connectedByUserId: pinUserId },
        );
      }
    } catch {
      // Repository-layer failure (e.g. service-role client error).
      // Sanitized — never echo the underlying message.
      return errorResponse({
        source,
        code: "SERVER_ERROR",
        message: "Couldn't look up integration. Try again.",
      });
    }
    if (integration === null) {
      if (decision.kind === "personal-creator") {
        // The creator is editing but hasn't connected — mirror 22B's
        // execution failure rather than the generic disconnected state.
        return errorResponse({
          source,
          code: "OWNER_MUST_CONNECT",
          message: `Connect ${resolver.provider} to configure and run this workflow.`,
        });
      }
      return errorResponse({
        source,
        code: "INTEGRATION_DISCONNECTED",
        message: `No active ${resolver.provider} integration. Connect ${resolver.provider} first.`,
      });
    }
  }

  // Resolver dispatch. When the credential is creator-pinned, run inside the 22B
  // credential-resolution context so any internal `refreshAndRetry` re-resolves
  // the SAME creator-pinned personal credential (covers the refreshable resolver
  // auth style; decrypt-direct resolvers already use the pre-resolved row).
  const dispatch = () =>
    resolver.resolve({
      userId: auth.userId,
      integration,
      q,
      deps,
      ...(workflowCreator !== null && { workflowCreator }),
    });
  try {
    const result =
      pinUserId !== null
        ? await runWithCredentialResolutionContext(
            { createdByUserId: pinUserId },
            dispatch,
          )
        : await dispatch();
    const payload: OptionsSourceResponse = {
      ok: true,
      source,
      items: result.items,
      hasMore: result.hasMore,
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof OptionsResolverError) {
      return errorResponse({
        source,
        code: err.code,
        message: err.message,
      });
    }
    // Uncaught — sanitize and downgrade to SERVER_ERROR.
    return errorResponse({
      source,
      code: "SERVER_ERROR",
      message: "Couldn't load options. Try again.",
    });
  }
}
