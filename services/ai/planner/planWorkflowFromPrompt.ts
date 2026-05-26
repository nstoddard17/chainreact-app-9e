/**
 * Model-backed workflow plan proposal + preview (Slice 4.AI-8B).
 *
 * The FIRST model-backed planning service. Given a natural-language prompt it:
 *   1. builds a registry-grounded planning request (AI-8A `buildWorkflowPlanRequest`);
 *   2. calls an INJECTED model client (`generateStructuredJson`);
 *   3. parses the structured response (AI-8A `parseWorkflowPlanResponse`);
 *   4. reconciles the proposed patch's target + baseRevision against the live
 *      workflow; and
 *   5. runs it through the deterministic AI-5 preview (which composes the AI-3
 *      validator + COST-2 estimate + AI-4 explanation).
 *
 * It NEVER applies (does not import AI-6 `services/ai/apply`), NEVER mutates or
 * persists a workflow, and NEVER persists model output. The model client is
 * dependency-injected; the default (AI-8C) is the env-configured runtime client
 * (`createRuntimeModelClient`), which itself falls back to the NOT_CONFIGURED
 * client when no API key is present — so the planner still fails safe.
 *
 * Safety: the model's proposed risk / cost / confirmation are IGNORED — the
 * deterministic preview's values win (it recomputes them). Literal secrets in
 * the model response are already refused by the AI-8A parser before this runs.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6/§9.
 */

import { getModelForFeature } from "@/core/ai/models";
import type {
  ModelFailure,
  ModelGenerateInput,
  ModelResult,
  ModelSuccess,
  ModelTier,
} from "@/core/ai/modelTypes";
import { createRuntimeModelClient } from "@/services/ai/modelClients";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import type { AiToolError } from "@/services/ai/tools/types";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import { buildWorkflowPlanRequest } from "./buildWorkflowPlanRequest";
import { parseWorkflowPlanResponse } from "./parseWorkflowPlanResponse";
import { WORKFLOW_PLAN_TOOL } from "./workflowPlanTool";
import {
  WORKFLOW_PLAN_FEATURE,
  type ParseWorkflowPlanFailure,
  type PlanModelMetadata,
  type PlanWorkflowFailure,
  type PlanWorkflowFromPromptInput,
  type PlanWorkflowResult,
  type WorkflowPlanResponse,
} from "./types";

function buildModelMeta(result: ModelResult, tier: ModelTier): PlanModelMetadata {
  const base: PlanModelMetadata = {
    modelId: result.modelId,
    tier,
    feature: result.feature,
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };
  if (!result.ok) return base;
  return {
    ...base,
    finishReason: result.finishReason,
    ...(result.usage ? { usage: result.usage } : {}),
  };
}

function modelFailure(result: ModelFailure, tier: ModelTier): PlanWorkflowFailure {
  return {
    ok: false,
    code: "MODEL_FAILED",
    message: `The model did not return a plan (${result.failureCode}).`,
    model: buildModelMeta(result, tier),
    errors: [{ stage: "model", code: result.failureCode, message: result.message }],
    noMutation: true,
  };
}

function parseFailure(
  parsed: ParseWorkflowPlanFailure,
  model: PlanModelMetadata,
): PlanWorkflowFailure {
  return {
    ok: false,
    code: "PARSE_FAILED",
    message: "The model response could not be parsed into a valid plan.",
    model,
    errors: [{ stage: "parse", code: parsed.code, message: parsed.message }],
    noMutation: true,
  };
}

function previewUnavailable(
  err: AiToolError,
  model: PlanModelMetadata,
): PlanWorkflowFailure {
  return {
    ok: false,
    code: "PREVIEW_UNAVAILABLE",
    message: "The proposed plan could not be previewed against the workflow.",
    model,
    errors: [{ stage: "preview", code: err.code, message: err.message }],
    noMutation: true,
  };
}

/** No-patch success (model needs user input / judged part of the request unsupported). */
function noPatchResult(
  response: WorkflowPlanResponse,
  model: PlanModelMetadata,
): PlanWorkflowResult {
  return {
    ok: true,
    intentSummary: response.intentSummary,
    assumptions: response.assumptions,
    requiredUserInput: response.requiredUserInput,
    unsupportedRequests: response.unsupportedRequests,
    safetyNotes: response.safetyNotes,
    canApplyLater: false,
    model,
    noMutation: true,
  };
}

export async function planWorkflowFromPromptForAI(
  input: PlanWorkflowFromPromptInput,
): Promise<PlanWorkflowResult> {
  const { userId, workflowId, prompt } = input;
  const feature = input.feature ?? WORKFLOW_PLAN_FEATURE;
  const tier: ModelTier = input.modelTier ?? getModelForFeature(feature).tier;
  // Default to the env-configured runtime client; with no API key it resolves to
  // the NOT_CONFIGURED client, so the planner still fails safe (MODEL_FAILED).
  const client = input.modelClient ?? createRuntimeModelClient({ feature, tier });

  // 1. Registry-grounded request (live catalog + connected integrations, AI-8A).
  const baseRequest = await buildWorkflowPlanRequest({
    userId,
    userRequest: prompt,
    tier,
  });
  // Slice 4.AI-19 — force structured output via Anthropic tool-use so the
  // model can never return prose that PARSE_FAILED/NOT_JSON's our parser.
  // Adapters that don't understand `responseTool` (mock client,
  // NOT_CONFIGURED, future non-Anthropic) IGNORE the field and behave
  // exactly as before — the wiring is additive.
  const request: ModelGenerateInput = {
    ...baseRequest,
    feature,
    responseTool: WORKFLOW_PLAN_TOOL,
  };

  // 2. Call the injected model client.
  const modelResult = await client.generateStructuredJson(request);
  if (!modelResult.ok) {
    return modelFailure(modelResult, tier);
  }
  const model = buildModelMeta(modelResult as ModelSuccess, tier);

  // 3. Parse + validate the structured response (never trusts raw text).
  const parsed = parseWorkflowPlanResponse(modelResult.text);
  if (!parsed.ok) {
    return parseFailure(parsed, model);
  }
  const response = parsed.response;

  // 4. No patch → surface clarification / unsupported, no preview.
  if (!response.proposedPatch) {
    return noPatchResult(response, model);
  }

  // 5. Reconcile target + revision: load the live workflow (ownership + NOT_FOUND
  //    via AI-2) to get the authoritative revision BEFORE previewing. baseRevision
  //    is set to the current revision so the patch is apply-ready (AI-6 rejects a
  //    stale base); workflowId is forced to the requested target (model value is
  //    advisory). A workflow that changed between this read and apply surfaces as
  //    a PATCH_CONFLICT at AI-6 apply time, not here.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) {
    return previewUnavailable(graphRes, model);
  }
  const patch: WorkflowPatch = {
    ...response.proposedPatch,
    workflowId,
    baseRevision: graphRes.data.updatedAt,
  };

  // 6. Deterministic preview (AI-3 validate + risk/cost + AI-4 explain).
  const previewRes = await previewWorkflowPatchForAI({ userId, workflowId, patch });
  if (!previewRes.ok) {
    return previewUnavailable(previewRes, model);
  }
  const preview = previewRes.data;

  return {
    ok: true,
    intentSummary: response.intentSummary,
    assumptions: response.assumptions,
    requiredUserInput: response.requiredUserInput,
    unsupportedRequests: response.unsupportedRequests,
    safetyNotes: response.safetyNotes,
    proposedPatch: patch,
    preview,
    canApplyLater: preview.canApplyLater,
    ...(preview.canApplyLater
      ? {}
      : { blockedReason: preview.blockedReason ?? "Preview rejected the proposed plan." }),
    model,
    noMutation: true,
  };
}
