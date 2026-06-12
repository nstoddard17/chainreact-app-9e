import { NextResponse } from "next/server";
import { getProvider } from "@/integrations/_registry";
import {
  countActiveByAccountProviderServiceRole,
  getActiveForExecution,
  getByIdForAccountServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { decideOptionsCredential } from "@/services/options/credentialPolicy";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import type { WorkflowCreatorContext } from "@/services/options/types";
import {
  deriveConnectionDiagnosis,
  type ConnectionDiagnosisManifest,
  type ConnectionDiagnosisRow,
  type ConnectionPrecondition,
} from "@/services/integrations/connectionDiagnosis";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/integration-connection — live, read-only
 * integration-connection diagnosis (Slice 4.MCP-STAGE-2B-2, CS-2).
 *
 * Reports the DERIVED connection status for `(provider, account)` under an
 * explicit subject `userId`, by reading STORED integration state + the provider
 * manifest and running the pure `deriveConnectionDiagnosis`. It makes NO provider
 * call, decrypts NO token, refreshes NO token, and mutates NOTHING.
 *
 * NOT a browser route — no `requireUser()`. The machine bearer
 * (`DIAGNOSTICS_API_TOKEN`) is the trust boundary; the subject is the explicit
 * `userId`. Same gate as 2B-1 (`applyDiagnosticsGate`): default OFF
 * (`DIAGNOSTICS_API_ENABLED`), 404 in prod unless `DIAGNOSTICS_API_ALLOW_PROD`,
 * 401 on a bad bearer (token never echoed).
 *
 * Authorization is SESSIONLESS: account access is checked with the service-role
 * `isMemberServiceRole` (the RLS-cookie `requireAccountRole` cannot resolve
 * membership without a session). Personal-provider provenance reuses
 * `decideOptionsCredential` — the same wall execution + the builder use:
 *   - not a member          → NO_ACCOUNT_ACCESS, NO integration row fetched.
 *   - personal + non-owner  → NOT_WORKFLOW_OWNER, NO credential row fetched.
 *   - personal + no workflow→ pinned to the SUBJECT's own connection.
 *   - account provider      → account-shared, no pin.
 *
 * NEVER returned: token blobs, plaintext token, `connectedByUserId`,
 * `providerAccountId`, `displayName`, raw `accountMetadata`, the full granted
 * scope list, raw provider bodies, env, or the exact expiry timestamp. The DTO is
 * an allow-list mapped from the derivation — the `IntegrationRecord` is never
 * spread.
 */

interface IntegrationConnectionDTO {
  readonly ok: boolean;
  readonly provider: string;
  readonly accountId: string | null; // echoes the caller-supplied / workflow-resolved account
  readonly status: string;
  readonly activeConnectionCount: number;
  readonly hasActiveRow: boolean;
  readonly providerEnabled: boolean;
  readonly refreshable: boolean;
  readonly credentialClass: "personal" | "account";
  readonly tokenExpired: boolean | null;
  readonly scopesSatisfied: boolean;
  readonly missingScopeCount: number;
  /** Only present in the MISSING_SCOPES arm (the gap names, never the full grant). */
  readonly missingScopes?: readonly string[];
}

const PROVIDER_RE = /^[a-z][a-z0-9_-]*$/;

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

function narrowRow(r: IntegrationRecord): ConnectionDiagnosisRow {
  // Only the three non-secret fields the derivation needs — the encrypted token
  // columns, connectedByUserId, providerAccountId, displayName, and metadata are
  // deliberately dropped here, at the boundary.
  return {
    scopes: r.scopes,
    accessTokenExpiresAt: r.accessTokenExpiresAt,
    disconnectedAt: r.disconnectedAt,
  };
}

function buildDto(
  provider: string,
  accountId: string | null,
  d: ReturnType<typeof deriveConnectionDiagnosis>,
): IntegrationConnectionDTO {
  return {
    ok: d.status === "CONNECTED",
    provider,
    accountId,
    status: d.status,
    activeConnectionCount: d.activeConnectionCount,
    hasActiveRow: d.hasActiveRow,
    providerEnabled: d.providerEnabled,
    refreshable: d.refreshable,
    credentialClass: d.credentialClass,
    tokenExpired: d.tokenExpired,
    scopesSatisfied: d.scopesSatisfied,
    missingScopeCount: d.missingScopeCount,
    ...(d.status === "MISSING_SCOPES" && { missingScopes: d.missingScopes }),
  };
}

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();

  const provider = typeof b.provider === "string" ? b.provider.trim() : "";
  if (!PROVIDER_RE.test(provider)) return badInput();

  const providedAccountId =
    typeof b.accountId === "string" && b.accountId.trim().length > 0
      ? b.accountId.trim()
      : null;
  const workflowId =
    typeof b.workflowId === "string" && b.workflowId.trim().length > 0
      ? b.workflowId.trim()
      : null;
  const integrationId =
    typeof b.integrationId === "string" && b.integrationId.trim().length > 0
      ? b.integrationId.trim()
      : null;

  // Exactly one locator is required.
  if (!providedAccountId && !workflowId) return badInput();

  const now = new Date();

  // ── Resolve the account context (and creator provenance when workflow-scoped). ──
  let accountId: string | null = providedAccountId;
  let workflowCreator: WorkflowCreatorContext | null = null;
  if (workflowId) {
    workflowCreator = await resolveWorkflowCreatorContext(workflowId);
    if (workflowCreator === null) {
      // Can't establish the workflow's account → can't authorize. No row fetched.
      const d = deriveConnectionDiagnosis(null, null, 0, now, "NO_ACCOUNT_ACCESS");
      return NextResponse.json(buildDto(provider, providedAccountId, d));
    }
    if (providedAccountId && providedAccountId !== workflowCreator.accountId) {
      return badInput(); // contradictory locators
    }
    accountId = workflowCreator.accountId;
  }
  // accountId is non-null here (one locator was present and resolved).
  const resolvedAccountId = accountId as string;

  // Manifest facts (public, repo-static). null → PROVIDER_UNKNOWN downstream.
  const manifestRaw = getProvider(provider);
  const manifest: ConnectionDiagnosisManifest | null = manifestRaw
    ? {
        id: manifestRaw.id,
        isEnabled: manifestRaw.isEnabled,
        refreshable: manifestRaw.refreshable,
        requiredScopes: manifestRaw.scopes.required,
      }
    : null;

  // ── Authorization (sessionless, service-role). ──
  let precondition: ConnectionPrecondition | undefined;
  let pinUserId: string | null = null;

  const isMember = await isMemberServiceRole(resolvedAccountId, userId);
  if (!isMember) {
    precondition = "NO_ACCOUNT_ACCESS";
  } else if (credentialSharingForProvider(provider) === "personal") {
    // Personal-provider provenance: same decision the builder + execution apply.
    if (workflowCreator) {
      const decision = decideOptionsCredential(provider, userId, workflowCreator, null);
      if (decision.kind === "not-owner") {
        precondition = "NOT_WORKFLOW_OWNER";
      } else if (decision.kind === "personal-creator") {
        pinUserId = decision.connectedByUserId;
      } else {
        // account/legacy shouldn't occur for a personal provider WITH a creator;
        // fall back to the subject's own connection rather than widening.
        pinUserId = userId;
      }
    } else {
      // No workflow context → only the subject's OWN connection is inspected
      // (never a co-member's personal credential / presence).
      pinUserId = userId;
    }
  }
  const sharing = credentialSharingForProvider(provider);

  // ── Read stored state (service-role) — ONLY when authorized + provider known. ──
  let row: ConnectionDiagnosisRow | null = null;
  let activeConnectionCount = 0;
  if (!precondition && manifest) {
    try {
      if (integrationId) {
        const r = await getByIdForAccountServiceRole(resolvedAccountId, integrationId);
        // Personal-provider by-id provenance guard: a row connected by another
        // member is indistinguishable from "not found" (no cross-member presence).
        if (
          r &&
          sharing === "personal" &&
          pinUserId &&
          r.connectedByUserId !== pinUserId
        ) {
          row = null;
        } else {
          row = r ? narrowRow(r) : null;
        }
        activeConnectionCount = row ? 1 : 0;
      } else {
        const r = await getActiveForExecution(
          resolvedAccountId,
          provider,
          null,
          pinUserId ? { connectedByUserId: pinUserId } : undefined,
        );
        row = r ? narrowRow(r) : null;
        if (sharing === "account") {
          // Account-shared: the account-wide active count is meaningful + safe.
          activeConnectionCount = await countActiveByAccountProviderServiceRole(
            resolvedAccountId,
            provider,
          );
        } else {
          // Personal: scope the count to the resolved connection so the response
          // never reveals how many OTHER members connected this provider.
          activeConnectionCount = row ? 1 : 0;
        }
      }
    } catch {
      // Repository/service-role failure — sanitized; treat as no resolvable row.
      row = null;
      activeConnectionCount = 0;
    }
  }

  const diagnosis = deriveConnectionDiagnosis(
    manifest,
    row,
    activeConnectionCount,
    now,
    precondition,
  );
  return NextResponse.json(buildDto(provider, resolvedAccountId, diagnosis));
}
