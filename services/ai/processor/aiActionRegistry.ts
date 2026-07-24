import type { ModelTier } from "@/core/ai/modelTypes";

/**
 * AI action registry (AI-PROVIDER-2 CS-2, plan decision 13).
 *
 * The frozen, fail-closed declaration home for every AI action/capability
 * — the AI analogue of `services/ai/reactAgent/capabilities.ts`. Only a
 * registered key executes through `executeAiAction`; an unknown key is
 * refused BEFORE any gate or model call.
 *
 * What an entry declares: billing feature, supported tiers, capability
 * flags. What it does NOT declare: credit AMOUNTS — those stay in
 * `core/billing/aiCreditPolicy.ts` (`FEATURE_BASE_CREDITS`), kept in
 * lockstep by test once CS-3 prices the features. Until CS-3 lands, the
 * three features below are deliberately UNPRICED and `executeAiAction`
 * refuses them (`feature_not_priced`) rather than riding the 5-credit
 * unmapped fallback.
 *
 * Tier vocabulary is the INTERNAL `ModelTier` ("fast" | "strong"); the
 * builder-facing `modelQuality` labels (standard/advanced) map onto it in
 * the action layer (CS-5/6).
 */

export type AiActionKey =
  | "ai:analyze_document"
  | "ai:transform_data"
  | "ai:suggest_schema"; // capability/route key (builder-time), not a canvas action

export interface AiActionRegistryEntry {
  readonly actionKey: AiActionKey;
  /** The `ai_cost_events.feature` key gated/charged for this action. */
  readonly feature: string;
  readonly supportedTiers: readonly ModelTier[];
  readonly structuredOutput: boolean;
  /** Phase 1: no AI action streams. Future streaming actions declare it here. */
  readonly streaming: boolean;
  readonly testModeAllowed: boolean;
  readonly costPreview: boolean;
  /** Env flag gating this action. Checked by `executeAiAction` before anything else. */
  readonly enabledFlag: string;
}

export const AI_ACTION_REGISTRY: Readonly<Record<AiActionKey, AiActionRegistryEntry>> =
  Object.freeze({
    "ai:analyze_document": Object.freeze({
      actionKey: "ai:analyze_document",
      feature: "document_analysis",
      supportedTiers: Object.freeze(["fast", "strong"]) as readonly ModelTier[],
      structuredOutput: true,
      streaming: false,
      testModeAllowed: true,
      costPreview: true,
      enabledFlag: "AI_PROCESSOR_ENABLED",
    }),
    "ai:transform_data": Object.freeze({
      actionKey: "ai:transform_data",
      feature: "data_transform",
      supportedTiers: Object.freeze(["fast", "strong"]) as readonly ModelTier[],
      structuredOutput: true,
      streaming: false,
      testModeAllowed: true,
      costPreview: true,
      enabledFlag: "AI_PROCESSOR_ENABLED",
    }),
    "ai:suggest_schema": Object.freeze({
      actionKey: "ai:suggest_schema",
      feature: "schema_suggestion",
      supportedTiers: Object.freeze(["fast"]) as readonly ModelTier[],
      structuredOutput: true,
      streaming: false,
      testModeAllowed: true,
      costPreview: true,
      enabledFlag: "AI_PROCESSOR_ENABLED",
    }),
  });

/**
 * Fail-closed lookup: accepts an arbitrary string so an untyped caller
 * still gets `undefined` (→ refused) instead of a crash.
 */
export function getAiActionRegistryEntry(
  actionKey: string,
): AiActionRegistryEntry | undefined {
  // Own-property check: prototype names ("toString", "constructor") must
  // fail closed like any other unknown key.
  if (!Object.prototype.hasOwnProperty.call(AI_ACTION_REGISTRY, actionKey)) {
    return undefined;
  }
  return (AI_ACTION_REGISTRY as Record<string, AiActionRegistryEntry>)[actionKey];
}

export function listAiActionRegistryEntries(): readonly AiActionRegistryEntry[] {
  return Object.values(AI_ACTION_REGISTRY);
}
