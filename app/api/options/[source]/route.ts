import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { resolveOptionsSource } from "@/services/options/resolveOptionsSource";

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

  // Parse query string.
  const url = new URL(request.url);
  const deps = extractDeps(url.searchParams);

  // The whole resolution (registry lookup → required-deps → credential-sharing
  // decision → integration lookup → resolver dispatch + error mapping) lives in
  // the shared `resolveOptionsSource` service so the live route and the internal
  // diagnostic route run the identical code path. The route only owns auth,
  // query parsing, and HTTP serialization. `q`-clamp happens inside the service.
  const { response } = await resolveOptionsSource({
    source,
    userId: auth.userId,
    q: url.searchParams.get("q") ?? "",
    deps,
    // Values the picker already holds and needs labels for (repeated
    // `selected` params). Normalization/bounding happens in the service, so
    // the route stays a parser. These are opaque option values — they widen
    // nothing: the resolver still runs under the same session-derived
    // credential decision as any other request.
    selected: url.searchParams.getAll("selected"),
    workflowId: url.searchParams.get("workflowId"),
    // CS-4 — the node being configured. Threaded so the server can resolve an
    // ACCEPTED per-node credential owner; client-supplied owner identity is
    // never trusted (the owner is read from workflow_node_credentials).
    nodeId: url.searchParams.get("nodeId"),
  });

  // Every non-auth arm is HTTP 200; the body's `ok` + `code` is the signal.
  return NextResponse.json(response);
}
