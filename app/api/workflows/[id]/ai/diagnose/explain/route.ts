import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { parseDraftOverride } from "@/services/ai/diagnostics/draftOverride";
import {
  explainWorkflowDiagnosis,
  type ExplainWorkflowDiagnosisResult,
} from "@/services/ai/diagnostics/explainWorkflowDiagnosis";
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
import { reactAgentService } from "@/services/ai/reactAgent";
import { loadWorkflowForMember, requireUser } from "../../../../_shared";

/**
 * POST /api/workflows/[id]/ai/diagnose/explain — optional LLM explanation of the
 * (already-computed) safe workflow diagnosis (Slice 4.AI-DIAG-2a).
 *
 * Explanation-ONLY: no patch / apply / repair / mutation / save / MCP / memory /
 * loop. The route is the paid/metered sibling of the 0-credit deterministic
 * `/ai/diagnose` (which is untouched + stays ungated).
 *
 * Flow: auth → `loadWorkflowForMember` (workflow-owning account + no-leak 404) →
 * **re-derive the DTO server-side** (`diagnoseWorkflowForAgent` — never trust a
 * client-posted DTO) → access wall returns the safe DTO with NO gate/model →
 * require OpenAI configured (so a known-unconfigured state never charges) →
 * `aiCreditGate` BEFORE the model call → OpenAI `fast` → record an
 * `ai_cost_events` model-call event (feature `workflow_explanation`, credits 1,
 * billed to the workflow-owning account, fail-open) → structured response.
 *
 * Status mapping: 401 unauth · 400 bad id · 404 not-found/non-member · 402
 * `AI_CREDITS_EXHAUSTED` (flag ON + insufficient) · 403 frozen · 503
 * `MODEL_FAILED`/`AI_GATE_ERROR`/not-configured · 500 unexpected (sanitized).
 *
 * No-leak: the model sees only `buildDiagnosisExplainContext(dto)`; the response
 * carries `{explanation, priorities?, missingInfo?}` — never a raw model dump,
 * config, token, integration row, account id, or provider account label.
 */

const MODEL_TIER = "fast" as const;
const EXPLAIN_FEATURE = "workflow_explanation" as const;

/** Mirror of the plan route's denial mapping — typed, no-leak `ok:false` bodies. */
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

/** Record the explanation model-call event, billing the workflow-owning account. Fail-open. */
async function recordExplainEvent(
  accountId: string,
  userId: string,
  workflowId: string,
  result: ExplainWorkflowDiagnosisResult,
): Promise<void> {
  try {
    const charge = computeAiCreditCharge({
      feature: EXPLAIN_FEATURE,
      isLlmCall: true,
      modelTier: MODEL_TIER,
    });
    const scope = { accountId, userId, feature: EXPLAIN_FEATURE, workflowId };
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
          kind: "workflow_diagnosis_explanation",
          creditPolicyVersion: charge.policyVersion,
        },
      });
    } else {
      await recordAiModelCallFailed(scope, {
        ...(result.model?.modelId ? { modelName: result.model.modelId } : {}),
        modelProvider: "openai",
        ...(result.model?.latencyMs !== undefined ? { latencyMs: result.model.latencyMs } : {}),
        metadata: { kind: "workflow_diagnosis_explanation", code: result.code },
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

  // AI-DIAG-FIX-1 — OPTIONAL current-builder-draft snapshot so Explain re-derives
  // the SAME current diagnosis "Check workflow" showed (not stale saved state).
  // Validated; used for the deterministic re-derivation only; never persisted.
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
        message: "The AI explanation service isn't available right now. Please try again later.",
        errors: [{ stage: "model", code: "NOT_CONFIGURED", message: "AI explanation not configured." }],
      },
      { status: 503 },
    );
  }

  // Credit gate BEFORE the model call. Flag OFF → no-op (explanation runs unmetered).
  const gate = await aiCreditGate({ accountId, feature: EXPLAIN_FEATURE, plannedTier: MODEL_TIER });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  const client = createModelClientForModel(getModelForProviderTier("openai", MODEL_TIER), apiKey);
  // REACT-AGENT-CS-4 — run the ALREADY-authorized, ALREADY-gated explain brain call THROUGH
  // the React Agent capability registry (capability `diagnosis_explain`, read-only). Auth,
  // membership, safe-DTO re-derivation, the OpenAI-config check, and `aiCreditGate` (above)
  // all stay route-owned; the boundary only validates the registered capability + scope +
  // intent and invokes the injected brain call — no HTTP, no gate, no mutation.
  const outcome = await reactAgentService.runAuthorizedCapability({
    scope: { userId: auth.userId, accountId, workflowId: id },
    intent: "explain_diagnosis",
    capabilityId: "diagnosis_explain",
    exec: () => explainWorkflowDiagnosis({ dto, modelClient: client, tier: MODEL_TIER }),
  });
  if (!outcome.ok) {
    // Unreachable on the wired path (route guarantees a valid scope + the explain
    // capability/intent); mapped to the same safe 503 as a model failure so the response
    // contract is unchanged.
    return NextResponse.json(
      {
        ok: false,
        code: "MODEL_FAILED",
        message: "Couldn't generate an explanation right now. Please try again.",
        errors: [{ stage: "model", code: "MODEL_FAILED", message: "Explanation unavailable." }],
      },
      { status: 503 },
    );
  }
  const result = outcome.result;

  // Fail-open telemetry, billed to the workflow-owning account.
  await recordExplainEvent(accountId, auth.userId, id, result);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: "Couldn't generate an explanation right now. Please try again.",
        errors: [{ stage: "model", code: result.code, message: "Explanation unavailable." }],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    explanation: result.explanation,
    ...(result.priorities ? { priorities: result.priorities } : {}),
    ...(result.missingInfo ? { missingInfo: result.missingInfo } : {}),
  });
}
