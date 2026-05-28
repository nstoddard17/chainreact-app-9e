/**
 * Slice 4.AI-30 — shared attribution computer for V1 and V2 packet shapes.
 * Both versions compute structural counts the same way (over the EFFECTIVE
 * catalog they shipped to the model) plus the narrowing decision metadata
 * (from the helper's result). Only `packetVersion` + the section chars
 * differ between V1 and V2.
 *
 * Extracted from `buildWorkflowPlanPrompt.ts` to keep that file under the
 * project soft line ceiling (AI-31 added enough wiring to push it over).
 * No behavior change — the function body is the same as before; it now
 * just lives in its own file. V2 and V1 builders both import from here.
 *
 * Slice 4.AI-31 — also computes the 10 tier-routing attribution fields
 * from optional `plannerTier` / `classifier` / `classifierAbsentReason`
 * inputs. Defaults preserve the AI-30 behavior when omitted.
 */

import type { ModelTier } from "@/core/ai/modelTypes";
import { FEATURE_DEFAULT_TIER } from "@/core/ai/models";
import { isUsableProvider } from "./buildWorkflowPlanPrompt";
import type { NarrowingClassifierResult } from "./narrowingClassifier";
import type { NarrowProvidersResult } from "./narrowProvidersForPlan";
import type { PlannerPromptAttribution, WorkflowPlanPromptInput } from "./types";

export interface ComputePlannerAttributionArgs {
  readonly packetVersion: string;
  readonly fullCatalog: WorkflowPlanPromptInput["catalog"];
  readonly effectiveCatalog: WorkflowPlanPromptInput["catalog"];
  readonly systemContent: string;
  readonly userContent: string;
  readonly catalogSection: string;
  readonly rulesSection: string;
  readonly connectedSection: string;
  readonly canvasSection: string;
  readonly connectedIntegrationCount: number;
  readonly currentGraph: WorkflowPlanPromptInput["currentGraph"];
  readonly narrowing: NarrowProvidersResult;
  // Slice 4.AI-31: optional tier-routing inputs. Both have safe defaults
  // so existing call sites continue to work unchanged.
  readonly plannerTier?: ModelTier;
  readonly classifier?: NarrowingClassifierResult | null;
  /** Reason the classifier wasn't used; e.g. "classifier_disabled". */
  readonly classifierAbsentReason?: string;
}

export function computePlannerAttribution(
  args: ComputePlannerAttributionArgs,
): PlannerPromptAttribution {
  const usable = args.effectiveCatalog.providers.filter(isUsableProvider);
  const totalUsable = args.fullCatalog.providers.filter(isUsableProvider).length;
  const catalogActionCount = usable.reduce((n, p) => n + p.actions.length, 0);
  const catalogTriggerCount = usable.reduce((n, p) => n + p.triggers.length, 0);
  const catalogFieldCount = usable.reduce(
    (n, p) =>
      n +
      p.actions.reduce((m, a) => m + a.configFields.length, 0) +
      p.triggers.reduce((m, t) => m + t.configFields.length, 0),
    0,
  );
  const catalogOutputFieldCount = usable.reduce(
    (n, p) =>
      n +
      p.actions.reduce((m, a) => m + a.outputs.length, 0) +
      p.triggers.reduce((m, t) => m + t.outputs.length, 0),
    0,
  );

  // Narrowing-enabled is the inverse of the `narrowing_disabled` sentinel.
  // `mode === "full-catalog"` alone doesn't mean disabled — narrowing can
  // be enabled and still bail to full-catalog for a safety reason.
  const providerNarrowingEnabled = args.narrowing.fallbackReason !== "narrowing_disabled";
  const providerNarrowingFallbackUsed =
    args.narrowing.mode === "full-catalog" && providerNarrowingEnabled;

  // Slice 4.AI-31 — tier-routing fields. The planner tier defaults to the
  // workflow_creation feature default (`"strong"`); callers can override
  // via `WorkflowPlanPromptInput.plannerTier`. Classifier fields reflect
  // either the deterministic helper's output OR null when the classifier
  // was disabled / unavailable.
  const plannerModelTier: ModelTier = args.plannerTier ?? FEATURE_DEFAULT_TIER.creation;
  const deterministicProviderCount = args.narrowing.providerIds.size;
  const classifier = args.classifier ?? null;
  const classifierUsed = classifier !== null;
  const classifierModelTier: ModelTier | null = classifier?.modelTier ?? null;
  const classifierConfidence = classifier?.confidence ?? null;
  const classifierProviderCount = classifier?.candidateProviders.length ?? null;
  // The catalog the planner ACTUALLY ships is driven by narrowing today;
  // classifier output is advisory and folded in only as observability.
  // When AI-31B wires a model classifier that adds providers, this will
  // become `narrowing.providerIds ∪ classifier.candidateProviders`. The
  // formula stays in this one place.
  const finalProviderCount = deterministicProviderCount;
  // `fallbackToDeterministic` flips true only when a CLASSIFIER attempt
  // failed and we ended up on deterministic narrowing alone. Today the
  // deterministic classifier is itself the only classifier, so this is
  // always false when the classifier ran successfully, and remains false
  // when it was disabled (we never "fell back" — we never tried).
  const fallbackToDeterministic = false;
  const fallbackToFullCatalog = providerNarrowingFallbackUsed;
  // Stable enum-like reason string. See the JSDoc on
  // `PlannerPromptAttribution.tierRoutingReason` for the vocabulary.
  let tierRoutingReason: string;
  if (args.classifierAbsentReason) {
    tierRoutingReason = args.classifierAbsentReason;
  } else if (args.plannerTier && args.plannerTier !== FEATURE_DEFAULT_TIER.creation) {
    tierRoutingReason = `user_override_${args.plannerTier}`;
  } else if (fallbackToFullCatalog && args.narrowing.fallbackReason) {
    tierRoutingReason = `narrowing_fallback_${args.narrowing.fallbackReason}`;
  } else {
    tierRoutingReason =
      plannerModelTier === "fast" ? "feature_default_fast" : "feature_default_strong";
  }

  return {
    packetVersion: args.packetVersion,
    totalPacketChars: args.systemContent.length + args.userContent.length,
    catalogChars: args.catalogSection.length,
    rulesChars: args.rulesSection.length,
    connectedIntegrationsChars: args.connectedSection.length,
    currentCanvasChars: args.canvasSection.length,
    userRequestChars: args.userContent.length,
    catalogProviderCount: usable.length,
    catalogActionCount,
    catalogTriggerCount,
    catalogFieldCount,
    catalogOutputFieldCount,
    connectedIntegrationCount: args.connectedIntegrationCount,
    currentCanvasNodeCount: args.currentGraph?.nodes.length ?? 0,
    currentCanvasEdgeCount: args.currentGraph?.edges.length ?? 0,
    catalogProvidersTotal: totalUsable,
    providerNarrowingEnabled,
    providerNarrowingMode: args.narrowing.mode,
    providerNarrowingFallbackUsed,
    ...(args.narrowing.fallbackReason
      ? { providerNarrowingReason: args.narrowing.fallbackReason }
      : {}),
    providerNarrowingOmittedCount:
      args.narrowing.mode === "narrowed"
        ? args.narrowing.omittedProviderCount
        : 0,
    // Slice 4.AI-31 — tier-routing fields.
    plannerModelTier,
    classifierUsed,
    classifierModelTier,
    classifierConfidence,
    classifierProviderCount,
    deterministicProviderCount,
    finalProviderCount,
    fallbackToDeterministic,
    fallbackToFullCatalog,
    tierRoutingReason,
  };
}
