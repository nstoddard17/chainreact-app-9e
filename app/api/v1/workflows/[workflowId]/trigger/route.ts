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
 * BEFORE any key lookup (no oracle that the route exists). Stays OFF until the
 * rate-limit seam (`services/apiKeys/rateLimit.ts`) is replaced by a durable
 * limiter; the execution billing gate is the interim economic backstop.
 *
 * Handler order (mirrors the webhook-route template, swapping signature → key auth):
 *   1. Flag gate           → 404 if OFF (no key lookup).
 *   2. verifyApiKey        → opaque 401 (missing / malformed / unknown / revoked /
 *                            expired all collapse to the same 401 — no oracle).
 *   3. scope check         → 403 `insufficient_scope` if `workflows:trigger` absent.
 *   4. rate-limit seam     → 429 if refused.
 *   5. workflow resolve    → service-role (no RLS/session); missing / deleted /
 *      + ownership            cross-account → the SAME generic 404 (no existence leak).
 *   6. freeze              → 403 if the key's account is pending deletion.
 *   7. state gate          → 409 if the workflow is not in a triggerable state.
 *   8. body                → JSON, ≤256 KiB; passed through as manual trigger input.
 *   9. enqueueRun          → 202 `{ ok, runId, enqueuedAt }`.
 *  10. last_used_at        → best-effort, swallowed; never fails a successful run.
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

  // 4. Rate-limit seam (permissive default; see services/apiKeys/rateLimit.ts).
  const rl = await rateLimitApiKeyTrigger({
    keyId: verified.keyId,
    accountId: verified.accountId,
  });
  if (!rl.allowed) {
    const res = jsonError(429, "Rate limit exceeded.", { code: "rate_limited" });
    if (rl.retryAfterSeconds != null) {
      res.headers.set("Retry-After", String(rl.retryAfterSeconds));
    }
    return res;
  }

  // 5. Resolve the workflow with the SERVICE-ROLE client (no user session / RLS).
  const { workflowId } = await params;
  const workflow = await workflowsRepo.getByIdServiceRole(workflowId);

  // 6. Existence + ownership: a missing workflow, a deleted one, OR one owned by a
  //    DIFFERENT account all collapse to the same generic 404 — a key never learns
  //    whether another account's workflow exists. This is the core isolation rule.
  if (!workflow || workflow.state === "deleted" || workflow.accountId !== verified.accountId) {
    return notFound();
  }

  // 7. Freeze — a pending-deletion account is non-operational (read-only check; no
  //    side effect, mirrors the engine's billing-gate freeze guard).
  if (await isAccountFrozen(verified.accountId)) {
    return jsonError(403, "This account is not available.", { code: "account_frozen" });
  }

  // 8. Triggerable-state gate (same set as run-now).
  if (!ALLOWED_STATES.has(workflow.state)) {
    return jsonError(409, "Workflow is not in a triggerable state.", {
      code: "workflow_not_triggerable",
      state: workflow.state,
    });
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

  // 11. Enqueue via the SAME path as run-now. `triggeredBy: "manual"` reuses an
  //     existing RunTriggerSource value (a dedicated "api_key" source is a closed
  //     union + a workflow_runs CHECK-constraint change → deferred to a migration
  //     slice); `triggeredByUserId: null` records that there is NO human actor,
  //     which distinguishes an API-key run from a human manual run.
  const enqueued = await enqueueRun({
    workflowId: workflow.id,
    triggerNodeId: triggerNode.id,
    event,
    testMode: false,
    triggeredBy: "manual",
    triggeredByUserId: null,
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
