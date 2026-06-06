import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as workflowsRepo from "@/repositories/workflows";
import { touchLastUsedServiceRole } from "@/repositories/accountApiKeys";
import { enqueueRun } from "@/services/execution/enqueue";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import { isPublicApiKeysEnabled } from "@/services/apiKeys/flags";
import { verifyApiKey } from "@/services/apiKeys/verify";
import { rateLimitApiKeyTrigger } from "@/services/apiKeys/rateLimit";
import { hasApiKeyScope, API_KEY_SCOPE_TRIGGER } from "@/core/apiKeys/scopes";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
  ManualTriggerPayloadSchema,
} from "@/integrations/native/triggers/manualTrigger";

/**
 * POST /api/v1/workflows/[workflowId]/trigger — PUBLIC, API-key-authenticated
 * workflow trigger (Slice 4.API-KEYS-FOUNDATION-5 / FK-4).
 *
 * The programmatic twin of `POST /api/workflows/[id]/run-now`, but with NO
 * Supabase cookie session and NO active-account state — auth is the API key
 * ALONE. The `/api/v1` namespace is the public, versioned surface (separate from
 * the cookie-gated `/api/workflows/...`). This is the FIRST public endpoint and is
 * intentionally narrow: trigger only. No read/list/manage/delete workflow API
 * ships here.
 *
 * Gated by `ENABLE_PUBLIC_API_KEYS` (default OFF) — when off the endpoint is a 404
 * BEFORE any key lookup (no oracle that the route exists). The rate limiter
 * (`services/apiKeys/rateLimit.ts`) is now a DURABLE, cross-instance Postgres
 * fixed-window limiter (per key / workflow / account), so the flag can be enabled
 * outside local/dev; the execution billing gate remains the economic backstop.
 *
 * Handler order (mirrors the webhook-route template, swapping signature → key auth):
 *   1. Flag gate           → 404 if OFF (no key lookup).
 *   2. verifyApiKey        → opaque 401 (missing / malformed / unknown / revoked /
 *                            expired all collapse to the same 401 — no oracle).
 *   3. scope check         → 403 `insufficient_scope` if `workflows:trigger` absent.
 *   4. workflow resolve    → service-role (no RLS/session); missing / deleted /
 *      + ownership            cross-account → the SAME generic 404 (no existence leak).
 *   5. freeze              → 403 if the key's account is pending deletion.
 *   6. state gate          → 409 if the workflow is not in a triggerable state.
 *   7. rate limit          → 429 + `Retry-After` if a per-key/workflow/account
 *                            window is exceeded (after a valid key + owned target).
 *   8. body                → JSON, ≤256 KiB; passed through as manual trigger input.
 *   9. enqueueRun          → 202 `{ ok, runId, enqueuedAt }`.
 *  10. last_used_at        → best-effort, swallowed; only on a successful (allowed) run.
 *
 * Billing: NOT deducted here. Exactly like run-now, billing/task usage is enforced
 * IN-ENGINE (`executionBillingGate`) after enqueue — adding a second deduction in
 * the route would double-bill. Frozen accounts are refused up-front (read-only
 * check); task-limit refusals surface via `workflow_runs.status`.
 *
 * No OAuth/integration token is read, returned, or decrypted. No `key_hash` or raw
 * key appears in any response or log. `created_by_user_id` is untouched.
 */

const BODY_BYTES_CAP = 256 * 1024;

/** Same triggerable set as run-now. */
const ALLOWED_STATES: ReadonlySet<string> = new Set(["active", "paused", "draft"]);

function jsonError(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** Opaque 401 — every auth failure mode collapses here (no existence/active oracle). */
function unauthorized(): NextResponse {
  return jsonError(401, "Unauthorized.");
}

/** Generic 404 — missing / deleted / cross-account all look identical (no leak). */
function notFound(): NextResponse {
  return jsonError(404, "Not found.");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> },
): Promise<Response> {
  // 1. Feature flag — OFF → 404 BEFORE any key lookup (no DB touch, no oracle that
  //    the endpoint exists). The public surface is dark until explicitly enabled.
  if (!isPublicApiKeysEnabled()) {
    return notFound();
  }

  // 2. API-key auth (no session). Opaque 401 on every failure reason.
  const authHeader = request.headers.get("authorization");
  const verified = await verifyApiKey(authHeader);
  if (!verified.ok) {
    console.info(
      JSON.stringify({ event: "api_key.auth_failed", reason: verified.reason }),
    );
    return unauthorized();
  }

  // 3. Scope — role gates who MINTS keys (FK-2); scope gates what a key may DO.
  if (!hasApiKeyScope(verified.scopes, API_KEY_SCOPE_TRIGGER)) {
    return jsonError(403, "Insufficient scope.", { code: "insufficient_scope" });
  }

  // 4. Resolve the workflow with the SERVICE-ROLE client (no user session / RLS).
  const { workflowId } = await params;
  const workflow = await workflowsRepo.getByIdServiceRole(workflowId);

  // 5. Existence + ownership: a missing workflow, a deleted one, OR one owned by a
  //    DIFFERENT account all collapse to the same generic 404 — a key never learns
  //    whether another account's workflow exists. This is the core isolation rule.
  //    Runs BEFORE the rate limiter so a cross-account probe gets 404, never a 429
  //    that would confirm the target (no limiter oracle for non-owned workflows).
  if (!workflow || workflow.state === "deleted" || workflow.accountId !== verified.accountId) {
    return notFound();
  }

  // 6. Freeze — a pending-deletion account is non-operational (read-only check; no
  //    side effect, mirrors the engine's billing-gate freeze guard).
  if (await isAccountFrozen(verified.accountId)) {
    return jsonError(403, "This account is not available.", { code: "account_frozen" });
  }

  // 7. Triggerable-state gate (same set as run-now).
  if (!ALLOWED_STATES.has(workflow.state)) {
    return jsonError(409, "Workflow is not in a triggerable state.", {
      code: "workflow_not_triggerable",
      state: workflow.state,
    });
  }

  // 8. Durable rate limit (per key / per workflow / per account) — runs only after
  //    a VALID key + scope + owned, non-frozen, triggerable target pass the earlier
  //    checks, and BEFORE enqueue. A denial returns 429 and does NOT enqueue a run,
  //    touch billing/task usage, or update `last_used_at`.
  const rl = await rateLimitApiKeyTrigger({
    keyId: verified.keyId,
    accountId: verified.accountId,
    workflowId: workflow.id,
  });
  if (!rl.allowed) {
    const res = jsonError(429, "Rate limit exceeded.", { code: "rate_limited" });
    if (rl.retryAfterSeconds != null) {
      res.headers.set("Retry-After", String(rl.retryAfterSeconds));
    }
    return res;
  }

  // 9. Body — optional JSON, capped, passed through as the manual trigger input.
  //    The public endpoint is always a real, billable, non-test run: there is no
  //    `testMode` and no destructive-confirmation gate (those are human-UI
  //    affordances of run-now; an API key with `workflows:trigger` is an explicit
  //    programmatic grant). Shape matches run-now's manual payload: `{ inputs }`.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null && Number(contentLengthHeader) > BODY_BYTES_CAP) {
    return jsonError(413, "Payload too large.");
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_BYTES_CAP) return jsonError(413, "Payload too large.");
    rawBody = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = ManualTriggerPayloadSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid trigger payload.");
  }

  // 10. Resolve the manual trigger node (the workflow's programmatic entry point).
  const triggerNode = workflow.draftDefinition.nodes.find(
    (n) =>
      n.kind === "trigger" &&
      n.provider === MANUAL_TRIGGER_PROVIDER &&
      n.type === MANUAL_TRIGGER_EVENT_TYPE,
  );
  if (!triggerNode) {
    return jsonError(422, "Workflow has no manual trigger.");
  }

  const event: TriggerEvent = {
    provider: MANUAL_TRIGGER_PROVIDER,
    eventType: MANUAL_TRIGGER_EVENT_TYPE,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    providerAccountId: "system",
    payload: parsed.data,
  };

  // 11. Enqueue via the SAME path as run-now. RH-2: the run is marked
  //     `triggeredBy: "api_key"` with NO human actor (`triggeredByUserId: null`) and
  //     non-secret provenance — the verified key's id (FK) + prefix snapshot. The
  //     raw key and key_hash never reach the run path. Billing is unchanged (still
  //     in-engine, billed to the workflow's account).
  const enqueued = await enqueueRun({
    workflowId: workflow.id,
    triggerNodeId: triggerNode.id,
    event,
    testMode: false,
    triggeredBy: "api_key",
    triggeredByUserId: null,
    triggeredByApiKeyId: verified.keyId,
    triggeredByApiKeyPrefix: verified.prefix,
  });

  // 12. last_used_at — best-effort, throttled in SQL, errors swallowed: a stale
  //     last-used timestamp must NEVER fail an otherwise-successful trigger.
  try {
    await touchLastUsedServiceRole({ keyId: verified.keyId });
  } catch {
    // intentionally ignored
  }

  return NextResponse.json(
    { ok: true, runId: enqueued.runId, enqueuedAt: enqueued.enqueuedAt },
    { status: 202 },
  );
}
