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
import { createPlannerModelClient } from "@/services/ai/modelClients";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import type { AiToolError } from "@/services/ai/tools/types";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import { buildWorkflowPlanRequestWithAttribution } from "./buildWorkflowPlanRequest";
import { deriveProviderChoiceInputs } from "./deriveProviderChoiceInputs";
import {
  deriveMissingRequiredFieldInputs,
  enrichRequiredUserInputs,
} from "./enrichRequiredUserInputs";
import { parseWorkflowPlanResponse } from "./parseWorkflowPlanResponse";
import { WORKFLOW_PLAN_TOOL } from "./workflowPlanTool";
import {
  isApplyBlockingRequiredInputKind,
  WORKFLOW_PLAN_FEATURE,
  type CurrentWorkflowGraphView,
  type ParseWorkflowPlanFailure,
  type PlanModelMetadata,
  type PlannerPromptAttribution,
  type PlanRequiredUserInput,
  type PlanWorkflowFailure,
  type PlanWorkflowFromPromptInput,
  type PlanWorkflowResult,
  type WorkflowPlanResponse,
} from "./types";

/**
 * Slice 4.AI-35 — fold deterministic `provider_choice` entries into the
 * model's `requiredUserInput`. When the request hits an ambiguous generic
 * category (email/calendar/…) and we synthesized a structured provider
 * choice, drop the model's free-text version of the SAME question (a bullet
 * that names ≥2 of the choice's option labels) so the user sees one
 * selectable control, not a control + a redundant bullet. Everything
 * field-specific or non-matching is preserved.
 */
function mergeProviderChoices(
  modelInputs: readonly PlanRequiredUserInput[],
  derived: readonly PlanRequiredUserInput[],
): readonly PlanRequiredUserInput[] {
  if (derived.length === 0) return modelInputs;
  const categories = derived
    .map((d) => d.category?.toLowerCase())
    .filter((c): c is string => !!c);
  const filteredModel = modelInputs.filter((e) => {
    // Field-specific entries + connect-provider setup + config values are
    // distinct concerns — always keep them.
    if (e.field || e.nodeId) return true;
    if (
      e.kind === "config_value" ||
      e.kind === "variable_reference" ||
      e.kind === "select_integration"
    ) {
      return true;
    }
    // A vague ambiguity question (choose_trigger / clarification /
    // provider_choice) that names a category we produced a structured choice
    // for is the SAME question — drop it so the user sees one control.
    const label = e.label.toLowerCase();
    const matchesCategory = categories.some((c) => label.includes(c));
    return !matchesCategory;
  });
  return [...derived, ...filteredModel];
}

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

function modelFailure(
  result: ModelFailure,
  tier: ModelTier,
  prompt: PlannerPromptAttribution,
): PlanWorkflowFailure {
  return {
    ok: false,
    code: "MODEL_FAILED",
    message: `The model did not return a plan (${result.failureCode}).`,
    model: buildModelMeta(result, tier),
    prompt,
    errors: [{ stage: "model", code: result.failureCode, message: result.message }],
    noMutation: true,
  };
}

function parseFailure(
  parsed: ParseWorkflowPlanFailure,
  model: PlanModelMetadata,
  prompt: PlannerPromptAttribution,
): PlanWorkflowFailure {
  return {
    ok: false,
    code: "PARSE_FAILED",
    message: "The model response could not be parsed into a valid plan.",
    model,
    prompt,
    errors: [{ stage: "parse", code: parsed.code, message: parsed.message }],
    noMutation: true,
  };
}

function previewUnavailable(
  err: AiToolError,
  model: PlanModelMetadata,
  prompt: PlannerPromptAttribution,
): PlanWorkflowFailure {
  return {
    ok: false,
    code: "PREVIEW_UNAVAILABLE",
    message: "The proposed plan could not be previewed against the workflow.",
    model,
    prompt,
    errors: [{ stage: "preview", code: err.code, message: err.message }],
    noMutation: true,
  };
}

/** No-patch success (model needs user input / judged part of the request unsupported). */
function noPatchResult(
  response: WorkflowPlanResponse,
  model: PlanModelMetadata,
  prompt: PlannerPromptAttribution,
  requiredUserInput: readonly PlanRequiredUserInput[],
): PlanWorkflowResult {
  return {
    ok: true,
    intentSummary: response.intentSummary,
    assumptions: response.assumptions,
    // Slice 4.AI-22/35 — already merged with derived provider choices +
    // enriched with FieldMeta hints (incl. existing-canvas node identities)
    // by the caller. Entries without nodeId/field (`select_integration`,
    // `clarification`, `provider_choice`) carry their own option/category
    // hints; the control layer renders choice/select controls for those.
    requiredUserInput,
    unsupportedRequests: response.unsupportedRequests,
    safetyNotes: response.safetyNotes,
    canApplyLater: false,
    model,
    prompt,
    noMutation: true,
  };
}

export async function planWorkflowFromPromptForAI(
  input: PlanWorkflowFromPromptInput,
): Promise<PlanWorkflowResult> {
  const { userId, workflowId, prompt } = input;
  const feature = input.feature ?? WORKFLOW_PLAN_FEATURE;
  // Slice 4.AI-36 — route the React Agent planner to OpenAI (gpt-4.1-mini);
  // Anthropic is dormant (emergency flag only) and is NEVER a silent fallback.
  // An injected client (tests) bypasses routing. With the OpenAI planner flag
  // off / unconfigured the routing returns a NOT_CONFIGURED client, so the
  // planner fails safe (MODEL_FAILED → "model unavailable"), NEVER Anthropic.
  const routing = input.modelClient
    ? undefined
    : createPlannerModelClient({
        feature,
        ...(input.modelTier ? { tier: input.modelTier } : {}),
      });
  const tier: ModelTier = input.modelTier ?? routing?.tier ?? getModelForFeature(feature).tier;
  const client = input.modelClient ?? routing!.client;

  // 1. Registry-grounded request (live catalog + connected integrations, AI-8A;
  //    AI-24 adds the current builder-canvas snapshot from the client). The
  //    canvas snapshot is the authoritative picture of what the user has RIGHT
  //    NOW — the server-saved `draftDefinition` may lag (e.g. user deleted
  //    nodes locally without saving).
  //
  //    Slice 4.AI-28 — the WithAttribution sibling also returns a
  //    `PlannerPromptAttribution` projection (per-section chars + structural
  //    counts) that we thread into every result shape so `recordAiPlanOutcome`
  //    can include it in `ai_cost_events.metadata`. No raw prompt content
  //    leaves this function via the attribution channel.
  const { request: baseRequest, attribution } = await buildWorkflowPlanRequestWithAttribution({
    userId,
    userRequest: prompt,
    tier,
    ...(input.currentGraph ? { currentGraph: input.currentGraph } : {}),
  });
  // Slice 4.AI-19 — force structured output via provider tool-use (function
  // call) so the model can never return prose that PARSE_FAILED/NOT_JSON's our
  // parser. The OpenAI Responses-API adapter (AI-34A/AI-36) reads `responseTool`
  // the same way the Anthropic adapter did; adapters that don't understand it
  // (mock / NOT_CONFIGURED) IGNORE it — the wiring is additive.
  const request: ModelGenerateInput = {
    ...baseRequest,
    feature,
    responseTool: WORKFLOW_PLAN_TOOL,
    // Slice 4.AI-36 — the request's tier-derived output cap comes from the
    // Anthropic registry inside `buildWorkflowPlanRequestWithAttribution`;
    // override it with the ROUTED provider's model budget so the OpenAI
    // planner keeps a planner-grade output budget (gpt-4.1-mini → 8192).
    ...(routing ? { maxOutputTokens: routing.maxOutputTokens } : {}),
  };

  // 2. Call the injected model client.
  const modelResult = await client.generateStructuredJson(request);
  if (!modelResult.ok) {
    return modelFailure(modelResult, tier, attribution);
  }
  const model = buildModelMeta(modelResult as ModelSuccess, tier);

  // 3. Parse + validate the structured response (never trusts raw text).
  const parsed = parseWorkflowPlanResponse(modelResult.text);
  if (!parsed.ok) {
    return parseFailure(parsed, model, attribution);
  }
  const response = parsed.response;

  // Slice 4.AI-35 — deterministic provider-choice derivation. When the
  // request names a generic category ("email") without naming the provider,
  // synthesize a STRUCTURED `provider_choice` entry (with options) so the
  // React Agent renders a choice control instead of a static bullet. Fires
  // only on genuine ambiguity (≥2 catalog providers, none named); returns []
  // otherwise. Catalog is the in-memory registry view (cheap, pure).
  const catalogRes = getProviderCatalog();
  const providerChoices = catalogRes.ok
    ? deriveProviderChoiceInputs(prompt, catalogRes.data)
    : [];
  const currentGraph: CurrentWorkflowGraphView | undefined = input.currentGraph;

  // 4. No patch → surface clarification / unsupported, no preview.
  if (!response.proposedPatch) {
    const merged = mergeProviderChoices(response.requiredUserInput, providerChoices);
    const enriched = enrichRequiredUserInputs(merged, null, currentGraph);
    return noPatchResult(response, model, attribution, enriched);
  }

  // 5. Reconcile target + revision: load the live workflow (ownership + NOT_FOUND
  //    via AI-2) to get the authoritative revision BEFORE previewing. baseRevision
  //    is set to the current revision so the patch is apply-ready (AI-6 rejects a
  //    stale base); workflowId is forced to the requested target (model value is
  //    advisory). A workflow that changed between this read and apply surfaces as
  //    a PATCH_CONFLICT at AI-6 apply time, not here.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) {
    return previewUnavailable(graphRes, model, attribution);
  }
  const patch: WorkflowPatch = {
    ...response.proposedPatch,
    workflowId,
    baseRevision: graphRes.data.updatedAt,
  };

  // 6. Deterministic preview (AI-3 validate + risk/cost + AI-4 explain).
  const previewRes = await previewWorkflowPatchForAI({ userId, workflowId, patch });
  if (!previewRes.ok) {
    return previewUnavailable(previewRes, model, attribution);
  }
  const preview = previewRes.data;

  // Slice 4.AI-20 — Apply-readiness gate for unresolved required input.
  //
  // The deterministic preview validates the patch's SHAPE (schema, cost,
  // risk) and can return `canApplyLater: true` when the patch is
  // structurally valid even though it contains `{{AI_FIELD:fieldName}}`
  // placeholders. Live smoke after AI-19 surfaced the resulting
  // contradiction: a plan with non-empty `requiredUserInput` (e.g. "Which
  // Slack channel?" / "What should the message say?") was rendered next
  // to an enabled Apply button because the patch shape validated.
  //
  // Rule (planner contract source of truth): `canApplyLater` is true ONLY
  // when the preview accepted the patch AND the AI flagged no outstanding
  // user input. The deterministic preview still runs and its
  // `validation`/`riskLevel`/`taskCostEstimate` still flow through — only
  // the apply gate is tightened. UI applies an identical guard as defense
  // in depth.
  // Slice 4.AI-33 — service-side required-field completeness. Derive a
  // question for every required field the model left empty in the patch
  // (a field it forgot entirely), merge with the model's own questions
  // (deduped on nodeId+field), then enrich the full set. This is the
  // safety net behind the R3/R7 prompt rules: even when the model omits a
  // required field, the user gets an actionable control + apply stays
  // blocked until it's answered.
  const derivedRequiredInput = deriveMissingRequiredFieldInputs(
    patch,
    response.requiredUserInput,
  );
  const withChoices = mergeProviderChoices(
    [...response.requiredUserInput, ...derivedRequiredInput],
    providerChoices,
  );
  // Slice 4.AI-35 — enrich with patch-node AND current-canvas node identities
  // (the latter lets existing-node-edit `updateNodeConfig` fields render as
  // controls).
  const mergedRequiredInput = enrichRequiredUserInputs(withChoices, patch, currentGraph);

  // Slice 4.AI-35 — Apply (= create/update the DRAFT graph) is gated only by
  // inputs needed to FORM a correct draft: missing config values, ambiguous
  // provider choices, unresolved triggers/variables/clarifications. A
  // `select_integration` (connect-a-disconnected-provider) requirement is an
  // ACTIVATION concern — it yields a not-ready draft node, not a blocked
  // Apply (see `isApplyBlockingRequiredInputKind`). This preserves the AI-20
  // safety floor for true required values while letting disconnected-provider
  // drafts be applied.
  const blockingRequiredInput = mergedRequiredInput.filter((e) =>
    isApplyBlockingRequiredInputKind(e.kind),
  );
  const requiredInputBlocking = blockingRequiredInput.length > 0;
  const canApplyLater = preview.canApplyLater && !requiredInputBlocking;
  const blockedReason = canApplyLater
    ? undefined
    : requiredInputBlocking
      ? "More information is still needed — answer the questions above and run Plan with AI again."
      : (preview.blockedReason ?? "Preview rejected the proposed plan.");

  return {
    ok: true,
    intentSummary: response.intentSummary,
    assumptions: response.assumptions,
    // Slice 4.AI-22 — enrich with FieldMeta hints derived from the patch's
    // `addNode` operations so the React Agent can render an interactive
    // RequiredInputControl per missing field (dropdown for static options,
    // async picker for `optionsSource`, text fallback otherwise).
    // Slice 4.AI-33 — the merged set also includes service-derived
    // questions for required fields the model forgot.
    requiredUserInput: mergedRequiredInput,
    unsupportedRequests: response.unsupportedRequests,
    safetyNotes: response.safetyNotes,
    proposedPatch: patch,
    preview,
    canApplyLater,
    ...(blockedReason ? { blockedReason } : {}),
    model,
    prompt: attribution,
    noMutation: true,
  };
}
