import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUserWithAccount,
  loadWorkflowForMember,
  parseJsonBody,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { aiCreditGate, type AiCreditGateOutcome } from "@/services/billing/aiCreditGate";
import { isHermesAgentEnabled, getHermesAgentGatewayConfig } from "@/services/ai-guidance/gateway/gatewayConfig";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";
import { runWorkflowGuidanceIntakeCapability } from "@/services/ai/reactAgent/capabilities/workflowGuidanceIntake";

/**
 * POST /api/accounts/[id]/ai/workflow-guidance (HERMES-AGENT-CAPABILITY-ROUTE).
 *
 * The gated server boundary for the advisory `workflow_guidance_intake` capability. A signed-in
 * account member asks for help figuring out what workflow they need; ChainReact forwards a SAFE
 * prompt to the Hermes Agent (via the Render gateway) and returns advisory guidance / clarifying
 * questions. ChainReact stays the final validator/governor — this route NEVER creates, updates,
 * applies, runs, or deletes a workflow, and never calls a model vendor / Nous / the private Hermes
 * Agent directly (only the capability runner, which uses the gateway client).
 *
 * Gates, in order (mirrors the diagnose/qa route; nothing charges/runs before its guard passes):
 *   1. auth + account membership + freeze → `requireUserWithAccount(id)` (401 / 403). The accountId
 *      is the VALIDATED URL param — never trusted from the body.
 *   2. strict body { goalText, workflowId? } → 400. `.strict()` blocks a client-supplied accountId.
 *   3. optional workflowId → must belong to THIS account + caller is a member → else no-leak 404.
 *      The workflow's saved draft is passed as the OPTIONAL safe context (sanitized by the runner).
 *   4. Hermes availability (`HERMES_AGENT_ENABLED` + gateway config) BEFORE any charge → 503 when
 *      disabled/unconfigured (no credit charge, no network).
 *   5. `aiCreditGate` (feature `workflow_guidance`, fast tier) BEFORE the capability call → 402/403/503.
 *   6. `runWorkflowGuidanceIntakeCapability` through the `runAuthorizedCapability` governance seam,
 *      injecting the persistent audit recorder (one safe `react_agent_audit_events` row).
 *
 * Telemetry note: this route does NOT write an `ai_cost_events` model-call row — ChainReact makes no
 * direct model call here (the Hermes Agent does), so there is nothing to attribute. The credit GATE
 * provides metering; usage reconciliation is a future slice. No migration is required.
 *
 * No-leak: the response carries only the normalized advisory fields (`guidanceText` / `source` /
 * `workflowPlan` / safe `warnings`) — never the raw provider envelope, raw usage, the prompt, the
 * gateway token, account/workflow ids, or any secret. The audit row carries scope ids + registry
 * enums only (no goal/guidance text). UI is a later slice.
 */

const MAX_GOAL_LENGTH = 2_000;

const BodySchema = z
  .object({
    goalText: z.string().trim().min(1, "A goal description is required.").max(MAX_GOAL_LENGTH, `Goal is too long (max ${MAX_GOAL_LENGTH} characters).`),
    workflowId: z.string().trim().min(1).optional(),
  })
  .strict();

/** Typed, no-leak credit-denial bodies (mirrors the diagnose/qa route). */
function aiCreditDenialResponse(gate: Extract<AiCreditGateOutcome, { ok: false }>): NextResponse {
  if (gate.reason === "account_frozen") {
    return NextResponse.json(
      { ok: false, code: "ACCOUNT_PENDING_DELETION", message: "This account is pending deletion." },
      { status: 403 },
    );
  }
  if (gate.reason === "gate_error") {
    return NextResponse.json(
      { ok: false, code: "AI_GATE_ERROR", message: "The AI assistant is temporarily unavailable. Please try again in a moment." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "You've used all AI credits for this billing period.", used: gate.used, limit: gate.limit },
    { status: 402 },
  );
}

/** Safe "guidance unavailable" response — disabled config or a provider/transport failure. */
function guidanceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "GUIDANCE_UNAVAILABLE",
      message: "Workflow guidance isn't available right now. Please try again later.",
    },
    { status: 503 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // 1. Auth + account membership + freeze. accountId is the validated URL param (never from body).
  const auth = await requireUserWithAccount(id);
  if (!auth.ok) return auth.response;
  const { userId, accountId } = auth;

  // 2. Strict body — goalText required; a client-supplied accountId/extra field is rejected.
  const parsed = await parseJsonBody(request, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { goalText, workflowId } = parsed.data;

  // 3. Optional workflow context — must belong to THIS account + caller is a member (else 404).
  let definition: import("@/contracts/workflow").WorkflowDefinition | undefined;
  if (workflowId) {
    const wf = await loadWorkflowForMember(workflowId, userId);
    if (!wf.ok) return wf.response;
    if (wf.record.accountId !== accountId) return workflowNotFoundResponse(); // cross-account → no leak
    definition = wf.record.draftDefinition;
  }

  // 4. Hermes availability BEFORE any charge — disabled/unconfigured → 503, no charge, no network.
  if (!isHermesAgentEnabled() || !getHermesAgentGatewayConfig()) {
    return guidanceUnavailableResponse();
  }

  // 5. Credit gate BEFORE the capability call. Metered as `workflow_guidance` (fast tier).
  const gate = await aiCreditGate({ accountId, feature: "workflow_guidance", plannedTier: "fast" });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  // 6. Run the advisory capability through the governance seam (audited). Read-only — no mutation.
  const result = await runWorkflowGuidanceIntakeCapability(
    {
      scope: { userId, accountId, ...(workflowId ? { workflowId } : {}) },
      goalText,
      ...(definition ? { definition } : {}),
    },
    { auditRecorder: reactAgentAuditRecorder },
  );

  if (!result.ok) {
    // PROVIDER_* / TIMEOUT / INVALID_RESPONSE / INVALID_SCOPE → safe unavailable. The runner already
    // failed closed; never surface the raw provider envelope or a raw error.
    return guidanceUnavailableResponse();
  }

  // Normalized advisory fields ONLY — no raw envelope, no raw usage, no prompt, no ids/secrets.
  return NextResponse.json({
    ok: true,
    guidanceText: result.guidanceText,
    source: result.source,
    workflowPlan: result.workflowPlan,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  });
}
