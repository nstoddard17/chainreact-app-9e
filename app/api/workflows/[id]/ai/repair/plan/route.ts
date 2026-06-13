import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";
import {
  planWorkflowRepair,
  type PlanWorkflowRepairResult,
} from "@/services/ai/repair/planWorkflowRepair";
import {
  aiCreditGate,
  type AiCreditGateOutcome,
} from "@/services/billing/aiCreditGate";
import {
  recordAiModelCallCompleted,
  recordAiModelCallFailed,
} from "@/services/billing/aiCostEvents";
import { computeAiCreditCharge } from "@/core/billing/aiCreditPolicy";
import { estimateModelCostMicros } from "@/core/ai/modelPricing";
import { getModelForProviderTier, MODEL_API_KEY_ENV } from "@/core/ai/models";
import {
  createModelClientForModel,
  isOpenAiProviderEnabled,
} from "@/services/ai/modelClients/createModelClient";
import { loadWorkflowForMember, requireUser } from "../../../../_shared";

/**
 * POST /api/workflows/[id]/ai/repair/plan — optional LLM REPAIR PROPOSAL for the
 * (already-computed) safe workflow diagnosis (Slice 4.AI-REPAIR-1b).
 *
 * Proposal-ONLY: no patch / apply / save / repair-execution / mutation / run /
 * MCP / memory / loop / graph change. It is the action-oriented, paid/metered
 * sibling of `/ai/diagnose/explain` (Explain DESCRIBES; this PROPOSES). The route
 * is inert until AI-REPAIR-1c wires a button — that is expected.
 *
 * Flow (mirrors the explain route exactly): auth → `loadWorkflowForMember`
 * (workflow-owning account + no-leak 404) → **re-derive the DTO server-side**
 * (never trust a client-posted DTO) → access wall returns the safe DTO with NO
 * gate/model → require OpenAI configured (so a known-unconfigured state never
 * charges) → `aiCreditGate` BEFORE the model call → OpenAI `fast` →
 * `planWorkflowRepair` → record an `ai_cost_events` model-call event (feature
 * `workflow_repair`, credits 4, billed to the workflow-owning account, fail-open)
 * → structured response.
 *
 * Status mapping: 401 unauth · 400 bad id · 404 not-found/non-member · 402
 * `AI_CREDITS_EXHAUSTED` (flag ON + insufficient) · 403 frozen · 503
 * `MODEL_FAILED`/`AI_GATE_ERROR`/not-configured · 500 unexpected (sanitized).
 *
 * No-leak: the model sees only `buildDiagnosisExplainContext(dto)`; the response
 * carries `{ ok, proposal }` (plain strings + advisory enum/booleans + the
 * server-set "not applied" notice) — never a raw model dump, config, token,
 * integration row, account id, node id, or provider account label.
 */

const MODEL_TIER = "fast" as const;
const REPAIR_FEATURE = "workflow_repair" as const;

/** Mirror of the explain route's denial mapping — typed, no-leak `ok:false` bodies. */
function aiCreditDenialResponse(
  gate: Extract<AiCreditGateOutcome, { ok: false }>,
): NextResponse {
  if (gate.reason === "account_frozen") {
    return NextResponse.json(
      {
        ok: false,
        code: "ACCOUNT_PENDING_DELETION",
        message: "This account is pending deletion.",
        errors: [{ stage: "billing", code: "ACCOUNT_PENDING_DELETION", message: "Account pending deletion." }],
      },
      { status: 403 },
    );
  }
  if (gate.reason === "gate_error") {
    return NextResponse.json(
      {
        ok: false,
        code: "AI_GATE_ERROR",
        message: "The AI assistant is temporarily unavailable. Please try again in a moment.",
        errors: [{ stage: "billing", code: "AI_GATE_ERROR", message: "AI credit gate error." }],
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      code: "AI_CREDITS_EXHAUSTED",
      message: "You've used all AI credits for this billing period.",
      used: gate.used,
      limit: gate.limit,
      errors: [{ stage: "billing", code: "AI_CREDITS_EXHAUSTED", message: "AI credit limit reached." }],
    },
    { status: 402 },
  );
}

/** Record the repair-proposal model-call event, billing the workflow-owning account. Fail-open. */
async function recordRepairEvent(
  accountId: string,
  userId: string,
  workflowId: string,
  result: PlanWorkflowRepairResult,
): Promise<void> {
  try {
    const charge = computeAiCreditCharge({
      feature: REPAIR_FEATURE,
      isLlmCall: true,
      modelTier: MODEL_TIER,
    });
    const scope = { accountId, userId, feature: REPAIR_FEATURE, workflowId };
    if (result.ok) {
      const micros = estimateModelCostMicros(result.model.modelId, result.model.usage);
      await recordAiModelCallCompleted(scope, {
        modelName: result.model.modelId,
        modelProvider: "openai",
        ...(result.model.usage
          ? { inputTokens: result.model.usage.inputTokens, outputTokens: result.model.usage.outputTokens }
          : {}),
        ...(result.model.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        ...(micros !== null ? { estimatedCostMicros: micros } : {}),
        aiCreditsCharged: charge.credits,
        metadata: {
          kind: "workflow_repair_proposal",
          creditPolicyVersion: charge.policyVersion,
        },
      });
    } else {
      await recordAiModelCallFailed(scope, {
        ...(result.model?.modelId ? { modelName: result.model.modelId } : {}),
        modelProvider: "openai",
        ...(result.model?.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        metadata: { kind: "workflow_repair_proposal", code: result.code },
      });
    }
  } catch {
    // Telemetry must never break the response.
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  }

  // AI-DIAG-FIX-1 — OPTIONAL current-builder-draft snapshot so Suggest-a-fix
  // re-derives the SAME current diagnosis "Check workflow" showed (not stale saved
  // state). Validated; used for the deterministic re-derivation only; never persisted.
  const body = await request.json().catch(() => ({}));
  const override = parseDraftOverride(body);
  if (!override.ok) {
    return NextResponse.json({ error: "Invalid workflow draft." }, { status: 400 });
  }

  // Workflow-owning account + membership (no-leak 404). The cost owner is resolved
  // server-side; never client-supplied.
  const wf = await loadWorkflowForMember(id, auth.userId);
  if (!wf.ok) return wf.response;
  const accountId = wf.record.accountId;

  // Re-derive the diagnosis server-side — the model never sees a client-posted DTO.
  let dto;
  try {
    dto = await diagnoseWorkflowForAgent({
      subjectUserId: auth.userId,
      workflowId: id,
      ...(override.draftOverride ? { draftOverride: override.draftOverride } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Failed to diagnose the workflow." }, { status: 500 });
  }

  // Access wall (NOT_FOUND / NO_ACCESS) → return the safe DTO; NO gate, NO model call.
  if (dto.access !== "OK") {
    return NextResponse.json(dto);
  }

  // OpenAI must be configured BEFORE we charge — a known-unconfigured state never
  // deducts. Reuse ENABLE_OPENAI_PROVIDER + OPENAI_API_KEY (NOT the planner flag).
  const apiKey = process.env[MODEL_API_KEY_ENV.openai];
  if (!isOpenAiProviderEnabled() || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        code: "MODEL_FAILED",
        message: "The AI repair assistant isn't available right now. Please try again later.",
        errors: [{ stage: "model", code: "NOT_CONFIGURED", message: "AI repair not configured." }],
      },
      { status: 503 },
    );
  }

  // Credit gate BEFORE the model call. Flag OFF → no-op (repair runs unmetered).
  const gate = await aiCreditGate({ accountId, feature: REPAIR_FEATURE, plannedTier: MODEL_TIER });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  const client = createModelClientForModel(getModelForProviderTier("openai", MODEL_TIER), apiKey);
  const result = await planWorkflowRepair({ dto, modelClient: client, tier: MODEL_TIER });

  // Fail-open telemetry, billed to the workflow-owning account.
  await recordRepairEvent(accountId, auth.userId, id, result);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: "Couldn't suggest a fix right now. Please try again.",
        errors: [{ stage: "model", code: result.code, message: "Repair proposal unavailable." }],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, proposal: result.proposal });
}
