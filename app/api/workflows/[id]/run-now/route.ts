import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as workflowsRepo from "@/repositories/workflows";
import { enqueueRun } from "@/services/execution/enqueue";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
  ManualTriggerPayloadSchema,
} from "@/integrations/native/triggers/manualTrigger";
import { notifyHighRiskRun } from "@/services/notifications/notifyHighRiskWorkflowEvent";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import {
  findConfirmationRequiredActions,
  isValidConfirmationText,
} from "@/services/workflows/riskConfirmation";
import {
  assertWorkflowRunEditAllowed,
  requireUser,
  requireWorkflowAccountMember,
  workflowNotFoundResponse,
} from "../../_shared";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";
import {
  getDefinitionForExecution,
  type ExecutionDefinitionMode,
} from "@/services/workflows/activeRevision";

/**
 * POST /api/workflows/[id]/run-now — Native-nodes Slice 2 Commit 1.
 *
 * Manual-trigger entry point per
 * docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §4 (NPD-N1).
 *
 * Authentication / authorization:
 *   - `requireUser()` — signed-in Supabase user only (401 otherwise).
 *   - Account-membership check (4.TEAM-WORKFLOWS-2B): the caller must be a
 *     member of `workflow.accountId`. This is MEMBERSHIP-based, not
 *     active-account equality — a member can run/test a Team workflow even
 *     while a different account is active (the workflow id is the anchor),
 *     matching the TW-1 detail/lifecycle routes. A non-member collapses to the
 *     same 404 the missing/deleted case returns (no existence leak). Roles are
 *     NOT consulted — any member may run/test.
 *   - Workflow state ∈ {active, paused, draft}. Other states return 409.
 *
 * Body (Slice 3.SEC-2 update):
 *   - JSON, capped at 256 KiB via `content-length` (exceeds → 413).
 *   - Top-level `testMode: boolean` (OPTIONAL). When true the engine
 *     short-circuits external + high-risk handlers. Defaults to `false`
 *     — a real production execution. The route NEVER silently promotes
 *     a request without `testMode: true` to a test run.
 *   - The remaining fields form the manual trigger payload and are
 *     validated by `ManualTriggerPayloadSchema` (shape:
 *     `{ inputs: Record<string,unknown> }`).
 *   - Missing body / `{}` → `{ inputs: {} }` with `testMode: false`.
 *
 * Output:
 *   - 202 Accepted — `{ runId, enqueuedAt, isTest, triggeredBy }`.
 *     Engine runs asynchronously after enqueue; failures surface via
 *     workflow_runs.status + the existing notification orchestrator.
 *     The background engine promise is handed to `after()` (Next →
 *     Vercel `waitUntil`) so the serverless instance is kept alive until
 *     the run finalizes (running → succeeded/failed). Without this the
 *     instance could freeze the moment the 202 is sent, leaving the run
 *     stuck `running` and invisible on the Runs page. `maxDuration`
 *     bounds that background window. The stale-running sweep remains a
 *     safety net, not the normal path.
 *
 * Bypasses `dispatchTriggerEvent` (which does dedup + state gate +
 * trigger_resources lookup) because the route already knows
 * `workflowId + triggerNodeId` from the URL + workflow lookup, has
 * authenticated the caller, and the state gate is enforced here.
 */

const BODY_BYTES_CAP = 256 * 1024;

/**
 * Upper bound (seconds) on the serverless invocation, including the
 * `after()` background engine work kicked off post-202. A manual run of a
 * small workflow (an HTTP request, a Slack post) finalizes in seconds; this
 * gives comfortable headroom so the run reaches a terminal status before the
 * platform reclaims the instance. Clamped by the deployment plan's ceiling.
 */
export const maxDuration = 60;

const ALLOWED_STATES: ReadonlySet<string> = new Set([
  "active",
  "paused",
  "draft",
]);

/**
 * Slice 3.SEC-2 — `testMode` is a sibling of the manual trigger payload,
 * not part of it. Extracting before schema validation keeps
 * ManualTriggerPayloadSchema strict (which would otherwise reject the
 * extra field) while letting clients send a single JSON body.
 *
 * Slice 3.SEC-4B — `confirmationText` is similarly a sibling. When the
 * workflow contains a destructive / requires-confirmation action AND
 * `testMode === false`, the caller MUST echo `"CONFIRM"` as
 * `confirmationText`; otherwise the route returns 409 with a
 * structured `CONFIRMATION_REQUIRED` response.
 */
const RunNowEnvelopeSchema = z
  .object({
    testMode: z.boolean().optional(),
    confirmationText: z.string().optional(),
  })
  .passthrough();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const workflow = await workflowsRepo.getById(id);
  if (!workflow || workflow.state === "deleted") {
    return workflowNotFoundResponse();
  }
  // 4.TEAM-WORKFLOWS-2B: account-membership authorization (aligned with the
  // TW-1 detail/lifecycle routes). Membership-based, not active-account
  // equality — a member can run a Team workflow while another account is
  // active. A non-member collapses to the same 404 (no existence leak). RLS
  // already scopes getById to the caller's account; this is defense-in-depth.
  // created_by_user_id is provenance, never consulted here.
  const authorized = await requireWorkflowAccountMember(auth.userId, workflow.accountId);
  if (!authorized.ok) return authorized.response;
  // WF-RUNPERM — a private-credential workflow runs under the CREATOR's external
  // OAuth identity (22B creator-pin). Only the creator may run it; non-creators
  // (incl. owner/admin) get a typed 403 and are pointed to Duplicate. Shared/
  // account-only + native-only workflows are unaffected (any member runs).
  const runEditDenied = await assertWorkflowRunEditAllowed(workflow, auth.userId);
  if (runEditDenied) return runEditDenied;
  if (!ALLOWED_STATES.has(workflow.state)) {
    return NextResponse.json(
      {
        error: `Workflow state '${workflow.state}' does not accept run-now.`,
        state: workflow.state,
      },
      { status: 409 },
    );
  }

  // V2-READY-35 — refuse up-front when the owning account is frozen /
  // pending-deletion, BEFORE creating a run. The in-engine billing gate
  // (executionBillingGate) is the authoritative execution chokepoint and also
  // refuses a frozen account before any node runs or any task is charged — this
  // route-level guard is defense-in-depth that avoids a phantom blocked-run row
  // and returns a clear, safe 403, matching the public /api/v1 trigger twin.
  // Read-only check; touches no billing logic. No account id / payload leaked.
  if (await isAccountFrozen(workflow.accountId)) {
    return NextResponse.json(
      { error: "This account is not available.", code: "account_frozen" },
      { status: 403 },
    );
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (
    contentLengthHeader !== null &&
    Number(contentLengthHeader) > BODY_BYTES_CAP
  ) {
    return NextResponse.json(
      { error: "Payload too large." },
      { status: 413 },
    );
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    rawBody = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // Slice 3.SEC-2 — extract testMode at the envelope layer BEFORE the
  // strict-mode payload schema, then pass only the remaining fields to
  // the manual trigger schema. testMode is engine-level provenance, not
  // part of the trigger payload semantics.
  const envelope = RunNowEnvelopeSchema.safeParse(rawBody ?? {});
  if (!envelope.success) {
    return NextResponse.json(
      {
        error: envelope.error.issues[0]?.message ?? "Invalid request envelope.",
        issues: envelope.error.issues,
      },
      { status: 400 },
    );
  }
  const {
    testMode: rawTestMode,
    confirmationText,
    ...payloadFields
  } = envelope.data;
  const testMode = rawTestMode === true;

  const parsed = ManualTriggerPayloadSchema.safeParse(payloadFields);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid manual trigger payload.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  // V2-READY-41E — resolve the SAME definition the engine will execute, so the
  // pre-flight trigger lookup + readiness + risk gate validate against it:
  //   - test preview → the mutable draft (no publish required);
  //   - real manual run → the active revision (V2-READY-41H, matching
  //     scheduled/webhook/poll), with the safe draft fallback for a workflow with
  //     no active_revision_id (legacy / pre-41C activations).
  const executionDefinitionMode: ExecutionDefinitionMode = testMode ? "draft" : "live";
  const executionDef = (
    await getDefinitionForExecution(workflow, executionDefinitionMode)
  ).definition;

  const triggerNode = executionDef.nodes.find(
    (n) =>
      n.kind === "trigger" &&
      n.provider === MANUAL_TRIGGER_PROVIDER &&
      n.type === MANUAL_TRIGGER_EVENT_TYPE,
  );
  if (!triggerNode) {
    return NextResponse.json(
      { error: "Workflow has no manual_trigger node." },
      { status: 422 },
    );
  }

  // Slice 3.SEC-4B — destructive-action confirmation gate.
  // Runs AFTER body validation + trigger-node lookup so malformed-
  // workflow signals (400 / 422) surface first; the confirmation
  // gate only fires once the request shape is otherwise valid.
  //
  // Only enforced for real-mode runs. testMode runs skip the gate
  // because SEC-2 already blocks `requiresIntegration: true` actions
  // before the handler is invoked — test-mode runs cannot actually
  // execute destructive provider calls, so a confirmation prompt
  // would be friction without safety value.
  //
  // Slice 3.POSTSEC-8 — the `risk` value is reused after enqueue to
  // decide whether to emit a `workflow_high_risk_run` audit event.
  let risk:
    | ReturnType<typeof findConfirmationRequiredActions>
    | null = null;
  if (!testMode) {
    risk = findConfirmationRequiredActions(executionDef.nodes);
    if (risk.requiresConfirmation && !isValidConfirmationText(confirmationText)) {
      return NextResponse.json(
        {
          error: "CONFIRMATION_REQUIRED",
          requiresConfirmation: true,
          confirmationText: risk.confirmationText,
          actions: risk.actions,
        },
        { status: 409 },
      );
    }

    // A (Run-Manually readiness preflight) — placed AFTER the destructive-
    // confirmation gate so a destructive workflow still surfaces
    // CONFIRMATION_REQUIRED (409) first. Blocks a real run when a node still
    // has empty required config, with a friendly message, instead of executing
    // and surfacing a raw handler Zod dump (`HANDLER_FAILED: [...]`). Reuses the
    // builder's metadata-derived required-field rules so the server's verdict
    // matches "Needs setup" (no parallel hardcoded rules). The handler Zod
    // schemas remain the final runtime safety net.
    //
    // Real runs only: test-mode runs skip external / high-risk handlers via the
    // testModeGate (native:http_request is explicitly blocked), so an
    // unconfigured action never actually executes in test mode — gating it
    // there would only reduce test-mode's usefulness on a partial workflow.
    //
    // Shared validator (B): required fields AND graph integrity (one trigger,
    // no orphan/unreachable actions, no edges referencing missing nodes).
    // Returns MISSING_REQUIRED_FIELDS or INVALID_WORKFLOW_GRAPH.
    const readinessError = checkWorkflowReadiness(executionDef);
    if (readinessError) {
      return NextResponse.json(readinessError, { status: 422 });
    }
  }

  const event: TriggerEvent = {
    provider: MANUAL_TRIGGER_PROVIDER,
    eventType: MANUAL_TRIGGER_EVENT_TYPE,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    providerAccountId: "system",
    payload: parsed.data,
  };

  // Triggered-by: "test" when the caller explicitly opted into test mode,
  // "manual" otherwise. Distinguishing these in workflow_runs lets us
  // answer "show me every real manual run" cleanly without crossing
  // is_test = false to filter.
  const triggeredBy = testMode ? "test" : "manual";

  const enqueued = await enqueueRun({
    workflowId: workflow.id,
    triggerNodeId: triggerNode.id,
    event,
    testMode,
    triggeredBy,
    // V2-READY-41E — execute the same definition we validated against above.
    executionDefinitionMode,
    // 4.ACCOUNT-MODEL-8: manual + test runs are human-initiated — record the
    // caller as the actor (workflow_runs.triggered_by_user_id). Webhook/cron
    // paths omit this → NULL.
    triggeredByUserId: auth.userId,
    // Keep the serverless instance alive until the fire-and-forget engine
    // promise finalizes the run, instead of letting it freeze when the 202
    // is sent (which left runs stuck `running` / invisible on /runs).
    keepAlive: (executionPromise) => {
      after(executionPromise);
    },
  });

  // Slice 3.POSTSEC-8 — emit a high-risk audit event when the run is
  // real-mode AND the workflow contained destructive / requires-
  // confirmation actions. testMode runs explicitly do NOT emit
  // (`notifyHighRiskRun` returns `skipped_test_mode` as belt-and-braces).
  // Best-effort — the helper swallows any DB error so an audit failure
  // never flips a successful 202 to 5xx.
  if (!testMode && risk && risk.requiresConfirmation) {
    await notifyHighRiskRun({
      workflowId: workflow.id,
      workflowName: workflow.name,
      actorUserId: auth.userId,
      runId: enqueued.runId,
      isTest: testMode,
      triggeredBy,
      confirmationRequiredActions: risk.actions,
    });
  }

  return NextResponse.json(
    {
      runId: enqueued.runId,
      enqueuedAt: enqueued.enqueuedAt,
      isTest: testMode,
      triggeredBy,
    },
    { status: 202 },
  );
}
