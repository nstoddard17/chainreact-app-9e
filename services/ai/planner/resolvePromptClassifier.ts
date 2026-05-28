/**
 * Slice 4.AI-34C — pure classifier/narrowing resolution shared by the V1 + V2
 * prompt builders.
 *
 * The async grounding layer (`buildWorkflowPlanRequestWithAttribution`) runs
 * the OpenAI model classifier (async) and threads its result + outcome onto
 * the pure {@link WorkflowPlanPromptInput}. This module decides, purely:
 *   - which classifier result the builder records (model when it succeeded,
 *     else the AI-31 deterministic classifier), and
 *   - the EFFECTIVE narrowed provider set (deterministic ∪ model candidates).
 *
 * **Additive-only invariant (the no-substitution rule wins):** the union can
 * only ADD valid catalog providers to a `narrowed` set. It NEVER removes an
 * explicit / connected / canvas / deterministic provider, NEVER shrinks a
 * `full-catalog` fallback, and NEVER adds an id absent from the catalog. A
 * low-confidence model result therefore cannot make the catalog smaller or
 * hide a provider the user named — the worst it can do is add an extra
 * (already-valid) provider.
 *
 * No model call happens here — the model already ran upstream. This stays pure
 * so both builders remain synchronous + fully unit-testable.
 */

import type { NarrowingClassifierResult } from "./narrowingClassifier";
import {
  isNarrowingClassifierEnabled,
  safeRunNarrowingClassifier,
} from "./narrowingClassifier";
import type {
  NarrowProvidersInput,
  NarrowProvidersResult,
} from "./narrowProvidersForPlan";
import type { ModelClassifierOutcome, WorkflowPlanPromptInput } from "./types";

/**
 * Union valid model-classifier candidate providers into a narrowed result.
 * Pure + additive: starts from `narrowing.providerIds` and only `.add`s ids
 * that exist in the catalog. Full-catalog mode is returned unchanged (every
 * provider is already present; adding is a no-op and shrinking is forbidden).
 */
export function augmentNarrowingWithModelCandidates(
  narrowing: NarrowProvidersResult,
  candidateProviders: readonly string[],
  catalogIds: ReadonlySet<string>,
): NarrowProvidersResult {
  if (narrowing.mode === "full-catalog") return narrowing;
  const providerIds = new Set(narrowing.providerIds);
  for (const id of candidateProviders) {
    if (catalogIds.has(id)) providerIds.add(id);
  }
  const added = providerIds.size - narrowing.providerIds.size;
  const omittedProviderCount = Math.max(0, narrowing.omittedProviderCount - added);
  return { ...narrowing, providerIds, omittedProviderCount };
}

export interface ResolvedPromptClassifier {
  /** The classifier to record (model result when it succeeded, else deterministic). */
  readonly classifier: NarrowingClassifierResult | null;
  /** The provider set the builder ships to the model (deterministic ∪ model candidates). */
  readonly effectiveNarrowing: NarrowProvidersResult;
  /** Provider count from the deterministic helper (pre-union). */
  readonly deterministicProviderCount: number;
  /** Provider count actually shipped (post-union). */
  readonly finalProviderCount: number;
  /** AI-31 reason the (deterministic) classifier was absent, when applicable. */
  readonly classifierAbsentReason?: string;
  /** AI-34C model-classifier outcome (drives fallback flags + tierRoutingReason). */
  readonly modelClassifierOutcome?: ModelClassifierOutcome;
}

/**
 * Resolve the classifier + effective narrowing for one prompt build.
 *
 * - Model classifier succeeded (`input.modelClassifier` present, `source:"model"`):
 *   use it as the classifier and union its valid candidates into narrowing.
 * - Otherwise (disabled / failed / not-configured / never attempted): run the
 *   AI-31 deterministic classifier and keep narrowing unchanged. Behavior is
 *   byte-identical to AI-31 when no model-classifier signal is threaded in.
 */
export function resolvePromptClassifier(
  input: WorkflowPlanPromptInput,
  narrowingInput: NarrowProvidersInput,
  narrowing: NarrowProvidersResult,
): ResolvedPromptClassifier {
  const deterministicProviderCount = narrowing.providerIds.size;
  const modelClassifier = input.modelClassifier ?? null;

  if (modelClassifier && modelClassifier.source === "model") {
    const catalogIds = new Set(input.catalog.providers.map((p) => p.id));
    const effectiveNarrowing = augmentNarrowingWithModelCandidates(
      narrowing,
      modelClassifier.candidateProviders,
      catalogIds,
    );
    return {
      classifier: modelClassifier,
      effectiveNarrowing,
      deterministicProviderCount,
      finalProviderCount: effectiveNarrowing.providerIds.size,
      modelClassifierOutcome: input.modelClassifierOutcome ?? "model_succeeded",
    };
  }

  // No usable model result — deterministic path exactly as AI-31.
  const classifier = safeRunNarrowingClassifier(narrowingInput, narrowing);
  const classifierAbsentReason =
    classifier === null && !isNarrowingClassifierEnabled()
      ? "classifier_disabled"
      : undefined;
  return {
    classifier,
    effectiveNarrowing: narrowing,
    deterministicProviderCount,
    finalProviderCount: deterministicProviderCount,
    ...(classifierAbsentReason ? { classifierAbsentReason } : {}),
    ...(input.modelClassifierOutcome
      ? { modelClassifierOutcome: input.modelClassifierOutcome }
      : {}),
  };
}
