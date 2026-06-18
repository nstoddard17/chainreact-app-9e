import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";
import { buildSelectedNodeDataSummary } from "@/services/ai/diagnostics/buildDiagnosisQaContext";
import {
  answerWorkflowQuestion,
  MAX_QUESTION_LENGTH,
  type AnswerWorkflowQuestionResult,
} from "@/services/ai/diagnostics/answerWorkflowQuestion";
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
 * POST /api/workflows/[id]/ai/diagnose/qa — single-shot, explanation-ONLY Q&A about the
 * (already-computed) safe workflow diagnosis (Slice 4.AI-DIAG-QA-2).
 *
 * The paid/metered sibling of `/ai/diagnose/explain`, adding a free-text user question and
 * an optional SAFE selected-node data summary. NO new feature flag (Marcus decision): it is
 * live behind the SAME operational gates the explain route uses (OpenAI configured + the
 * existing `aiCreditGate` enforcement flag). NO patch / apply / repair / mutation / save /
 * run / activation / MCP / memory / multi-turn.
 *
 * Flow (mirrors explain): auth → validate question + parse optional draft →
 * `loadWorkflowForMember` (workflow-owning account + no-leak 404) → **re-derive the DTO
 * server-side** (never trust a client DTO) → access wall (no gate/model) → require OpenAI
 * configured (503) → `aiCreditGate` BEFORE the model (feature `workflow_qa`, fast tier) →
 * build the SAFE selected-node summary from the authorized definition → OpenAI `fast` →
 * record an `ai_cost_events` model-call event (fail-open) → structured response.
 *
 * Status mapping: 401 unauth · 400 bad id/question/draft · 404 not-found/non-member ·
 * 402 `AI_CREDITS_EXHAUSTED` · 403 frozen · 503 `MODEL_FAILED`/`AI_GATE_ERROR`/not-configured
 * · 500 unexpected (sanitized).
 *
 * No-leak: the model sees only `buildDiagnosisQaContext(dto, selectedNode)`; `selectedNodeId`
 * is validated against the re-derived graph and NEVER echoed to the model or response; the
 * response carries `{answer, pointers?, needsUserDecision?}` — never a raw model dump, ids,
 * config, tokens, integration rows, account id, or the question echoed back.
 */

const MODEL_TIER = "fast" as const;
/** Credit-CHARGE feature key (Marcus decision). NOT the DB `ai_cost_events.feature` value. */
const QA_CHARGE_FEATURE = "workflow_qa" as const;
/**
 * DB `ai_cost_events.feature` value for the telemetry row. The column's CHECK constraint has
 * no `workflow_qa` entry and this slice adds NO migration, so the row is recorded as `other`
 * + `metadata.kind: "workflow_diagnosis_qa"` (queryable/attributable). The CREDIT CHARGE is
 * still metered as `workflow_qa` via `computeAiCreditCharge` / the gate.
 */
const QA_EVENT_FEATURE = "other" as const;
const QA_EVENT_KIND = "workflow_diagnosis_qa" as const;

/** Typed, no-leak `ok:false` credit-denial bodies (mirrors the explain route). */
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

/** Record the Q&A model-call event, billing the workflow-owning account. Fail-open. */
async function recordQaEvent(
  accountId: string,
  userId: string,
  workflowId: string,
  result: AnswerWorkflowQuestionResult,
): Promise<void> {
  try {
    const charge = computeAiCreditCharge({
      feature: QA_CHARGE_FEATURE,
      isLlmCall: true,
      modelTier: MODEL_TIER,
    });
    const scope = { accountId, userId, feature: QA_EVENT_FEATURE, workflowId };
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
          kind: QA_EVENT_KIND,
          chargeFeature: QA_CHARGE_FEATURE,
          creditPolicyVersion: charge.policyVersion,
        },
      });
    } else {
      await recordAiModelCallFailed(scope, {
        ...(result.model?.modelId ? { modelName: result.model.modelId } : {}),
        modelProvider: "openai",
        ...(result.model?.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        metadata: { kind: QA_EVENT_KIND, chargeFeature: QA_CHARGE_FEATURE, code: result.code },
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

  const body = await request.json().catch(() => ({}));

  // Validate the question: required non-empty string, trimmed, hard length cap.
  const rawQuestion = (body as { question?: unknown }).question;
  if (typeof rawQuestion !== "string") {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  const question = rawQuestion.trim();
  if (question.length === 0) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
      { status: 400 },
    );
  }

  // Optional current-builder-draft snapshot (re-derivation only; never persisted).
  const override = parseDraftOverride(body);
  if (!override.ok) {
    return NextResponse.json({ error: "Invalid workflow draft." }, { status: 400 });
  }

  // Optional selected node — validated against the re-derived graph below; bogus is ignored.
  const rawSelectedNodeId = (body as { selectedNodeId?: unknown }).selectedNodeId;
  const selectedNodeId = typeof rawSelectedNodeId === "string" && rawSelectedNodeId.trim() !== ""
    ? rawSelectedNodeId
    : undefined;

  // Workflow-owning account + membership (no-leak 404). Cost owner resolved server-side.
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

  // OpenAI must be configured BEFORE we charge — a known-unconfigured state never deducts.
  const apiKey = process.env[MODEL_API_KEY_ENV.openai];
  if (!isOpenAiProviderEnabled() || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        code: "MODEL_FAILED",
        message: "The AI assistant isn't available right now. Please try again later.",
        errors: [{ stage: "model", code: "NOT_CONFIGURED", message: "AI Q&A not configured." }],
      },
      { status: 503 },
    );
  }

  // Credit gate BEFORE the model call. Metered as `workflow_qa` (fast tier).
  const gate = await aiCreditGate({ accountId, feature: QA_CHARGE_FEATURE, plannedTier: MODEL_TIER });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  // Build the SAFE selected-node data summary from the SAME authorized definition the
  // diagnosis used (draft override else saved). Bogus/absent selectedNodeId → undefined.
  const definition = override.draftOverride ?? wf.record.draftDefinition;
  const selectedNode = buildSelectedNodeDataSummary(definition, selectedNodeId);

  const client = createModelClientForModel(getModelForProviderTier("openai", MODEL_TIER), apiKey);
  const result = await answerWorkflowQuestion({
    dto,
    question,
    ...(selectedNode ? { selectedNode } : {}),
    modelClient: client,
    tier: MODEL_TIER,
  });

  // Fail-open telemetry, billed to the workflow-owning account.
  await recordQaEvent(accountId, auth.userId, id, result);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: "Couldn't answer that right now. Please try again.",
        errors: [{ stage: "model", code: result.code, message: "Answer unavailable." }],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    answer: result.answer,
    ...(result.pointers ? { pointers: result.pointers } : {}),
    ...(result.needsUserDecision !== undefined ? { needsUserDecision: result.needsUserDecision } : {}),
  });
}
