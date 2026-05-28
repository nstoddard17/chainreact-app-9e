/**
 * Grounding helper: compose AI-2 context, then build the model request (AI-8A).
 *
 * `buildWorkflowPlanRequest` is the seam where the planner is grounded in LIVE
 * registry metadata: it pulls the provider catalog (`getProviderCatalog`) and
 * the caller's connected integrations (`getConnectedIntegrationsForAI`) from the
 * AI-2 tools, then delegates to the pure {@link buildWorkflowPlanPrompt} and
 * returns a {@link ModelGenerateInput} ready to hand to a {@link ModelClient}.
 *
 * It does NOT call a model, mutate, preview, or apply anything. Catalog /
 * integration lookups are best-effort: a failure degrades to an empty list (the
 * prompt then states nothing is available) rather than throwing.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.2.
 */

import { getModelForFeature, getModelForTier } from "@/core/ai/models";
import type { ModelGenerateInput } from "@/core/ai/modelTypes";
import { getConnectedIntegrationsForAI } from "@/services/ai/tools/integrations";
import {
  getProviderCatalog,
  type ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";
import { buildWorkflowPlanPromptWithAttribution } from "./buildWorkflowPlanPrompt";
import { runModelNarrowingClassifier } from "./modelNarrowingClassifier";
import {
  WORKFLOW_PLAN_FEATURE,
  type PlannerPromptAttribution,
  type WorkflowPlanRequestInput,
} from "./types";

const EMPTY_CATALOG: ProviderCatalogView = { providers: [] };

/**
 * Back-compat wrapper around
 * {@link buildWorkflowPlanRequestWithAttribution} that returns the request
 * only. Existing callers (AI-9A test paths and any non-orchestrator
 * consumer) stay unchanged. The orchestrator
 * (`planWorkflowFromPromptForAI`) uses the sibling so it can thread
 * per-section attribution into `recordAiPlanOutcome` (Slice 4.AI-28).
 */
export async function buildWorkflowPlanRequest(
  input: WorkflowPlanRequestInput,
): Promise<ModelGenerateInput> {
  return (await buildWorkflowPlanRequestWithAttribution(input)).request;
}

/**
 * Slice 4.AI-28 — same registry-grounded `ModelGenerateInput` as
 * {@link buildWorkflowPlanRequest} plus a {@link PlannerPromptAttribution}
 * side-channel for cost observability. Single source of truth for the
 * prompt being sent: the attribution is computed from the SAME section
 * strings that get serialized into `messages[0].content`, so dashboards
 * decomposing the input-token bill see exact char counts per section.
 */
export async function buildWorkflowPlanRequestWithAttribution(
  input: WorkflowPlanRequestInput,
): Promise<{
  readonly request: ModelGenerateInput;
  readonly attribution: PlannerPromptAttribution;
}> {
  const catalogRes = getProviderCatalog();
  const catalog = catalogRes.ok ? catalogRes.data : EMPTY_CATALOG;

  const integrationsRes = await getConnectedIntegrationsForAI(input.userId);
  const connectedIntegrations: readonly ConnectedIntegrationView[] =
    integrationsRes.ok ? integrationsRes.data.integrations : [];

  const model = input.tier
    ? getModelForTier(input.tier)
    : getModelForFeature(WORKFLOW_PLAN_FEATURE);

  // Slice 4.AI-34C — OpenAI fast-tier intent classifier (ADVISORY, additive).
  // Gated (default off): when enabled + OpenAI configured it adds candidate
  // providers to the deterministic narrowing; on any failure it returns null
  // and the planner proceeds on deterministic narrowing. The PLANNER itself
  // stays on Anthropic/Sonnet — this only augments which providers the
  // Anthropic planner sees in its catalog. Runs before the (pure) prompt
  // build because the model call is async.
  const { result: modelClassifier, outcome: modelClassifierOutcome } =
    await runModelNarrowingClassifier({
      userRequest: input.userRequest,
      catalog,
      connectedIntegrations,
      ...(input.currentGraph ? { currentGraph: input.currentGraph } : {}),
    });

  const { messages, attribution } = buildWorkflowPlanPromptWithAttribution({
    userRequest: input.userRequest,
    catalog,
    connectedIntegrations,
    ...(input.costAwareness ? { costAwareness: input.costAwareness } : {}),
    // Slice 4.AI-24 — current builder-canvas snapshot (pending / unsaved
    // graph) from the client. Forwarded verbatim; the prompt renderer is
    // responsible for the (empty | populated) shape decision.
    ...(input.currentGraph ? { currentGraph: input.currentGraph } : {}),
    // Slice 4.AI-31 — surface the resolved planner tier so attribution
    // records `plannerModelTier` correctly when callers pass a tier
    // override.
    plannerTier: model.tier,
    // Slice 4.AI-34C — thread the model-classifier result (when it succeeded)
    // + outcome down to the pure builder, which unions valid candidates into
    // narrowing and records the routing telemetry.
    ...(modelClassifier ? { modelClassifier } : {}),
    modelClassifierOutcome,
  });

  const request: ModelGenerateInput = {
    feature: WORKFLOW_PLAN_FEATURE,
    tier: input.tier ?? model.tier,
    messages,
    maxOutputTokens: model.maxOutputTokens,
  };

  return { request, attribution };
}
