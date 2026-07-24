import type { AiFeature, ModelTier } from "@/core/ai/modelTypes";
import type { AiCostFeature } from "@/repositories/aiCostEvents";

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
 * lockstep by test. CS-3 priced all three features (3 / 2 / 1), so the
 * 5-credit unmapped fallback is structurally unreachable here;
 * `executeAiAction` still refuses an unpriced feature
 * (`feature_not_priced`) so a future regression that removes a price
 * fails closed instead of silently over-charging.
 *
 * Tier vocabulary is the INTERNAL `ModelTier` ("fast" | "strong"); the
 * builder-facing `modelQuality` labels (standard/advanced) map onto it in
 * the action layer (CS-5/6).
 */

export type AiActionKey =
  | "ai:analyze_document"
  | "ai:transform_data"
  | "ai:suggest_schema"; // capability/route key (builder-time), not a canvas action

/**
 * A feature key valid for BOTH the model layer (`AiFeature`) and the cost
 * ledger (`AiCostFeature`). The intersection is a COMPILE-TIME lockstep: a
 * registry entry cannot name a feature the model client can't request or the
 * ledger can't record (AI-PROVIDER-3 CS-3). Runtime lockstep against the
 * credit policy and the DB CHECK constraint is test-enforced.
 */
export type AiProviderFeature = AiFeature & AiCostFeature;

export interface AiActionRegistryEntry {
  readonly actionKey: AiActionKey;
  /** The feature key gated, charged, and recorded for this action. */
  readonly feature: AiProviderFeature;
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
