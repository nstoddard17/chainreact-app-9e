/**
 * Slice 4.AI-31 — narrowing-classifier interface + deterministic helper.
 *
 * The narrowing classifier is a typed seam between the AI-30 deterministic
 * narrowing helper and a future model-backed classifier (AI-31B). It
 * describes, in classifier-shaped output, what the planner would have
 * inferred if it were asking a cheap model "what is this user trying to
 * do, and which providers do they need" — but the AI-31 implementation
 * is **purely deterministic**: every field is computed from the same
 * signals `narrowProvidersForPlan` already consumes (request text,
 * connected integrations, current canvas, alias map).
 *
 * **DOES NOT route patch generation to a cheaper model.** The strong-tier
 * planner is unchanged. The classifier output is **advisory** and folded
 * into `PlannerPromptAttribution` for observability so a future AI-31B
 * can decide whether a real Haiku classifier is worth shipping.
 *
 * Safety rules (mirrored from the AI-30 helper):
 *   - The classifier NEVER drops providers from the narrowed set.
 *     `candidateProviders` is the helper's recommendation; the caller
 *     enforces "candidateProviders is a SUPERSET of narrowing.providerIds"
 *     when integrating future model output.
 *   - Explicit canonical-id mentions stay "high" confidence.
 *   - Connected and canvas providers are always reflected.
 *   - When the deterministic narrowing helper falls back to the full
 *     catalog, `broadOrAmbiguous` is true so the classifier flags the
 *     same unsafe-to-narrow case.
 *   - The helper does NOT throw on any documented input. The seam wraps
 *     it in a try/catch defensively anyway so a future model classifier
 *     (which CAN throw — network errors, JSON parse failures) plugs into
 *     the same fallback path without changes upstream.
 *
 * Rollback: `process.env.ENABLE_AI_NARROWING_CLASSIFIER === "false"`
 * short-circuits the seam. Read at call-time so unit tests can flip
 * per-case without a module reload.
 */

import type { ModelTier } from "@/core/ai/modelTypes";
import type { NarrowProvidersInput, NarrowProvidersResult } from "./narrowProvidersForPlan";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * What a narrowing-classifier returns. Stable shape — a future
 * model-backed classifier (AI-31B) will return the same envelope.
 *
 * `source` + `modelTier` distinguish a deterministic emission from a
 * model-backed one so dashboards / tests can tell them apart in
 * `ai_cost_events.metadata.classifierModelTier`.
 */
export interface NarrowingClassifierResult {
  /** What the user is trying to do — high-level intent. */
  readonly intentType: "create" | "edit" | "repair" | "help" | "unknown";
  /** Confidence the narrowing decision is safe for this request. */
  readonly confidence: "high" | "medium" | "low";
  /**
   * Providers the classifier suggests should be in the catalog the
   * planner sees. ADVISORY only — never used to remove a provider that
   * narrowing already included.
   */
  readonly candidateProviders: readonly string[];
  /**
   * `provider:type` keys the classifier expects to be the trigger.
   * Deterministic helper returns `[]` — a future model classifier will
   * populate.
   */
  readonly triggerHints: readonly string[];
  /**
   * `provider:type` keys the classifier expects to be the actions.
   * Deterministic helper returns `[]` — a future model classifier will
   * populate.
   */
  readonly actionHints: readonly string[];
  /**
   * True when the request is too broad / ambiguous to safely narrow.
   * Mirrors the narrowing helper's full-catalog fallback decision.
   */
  readonly broadOrAmbiguous: boolean;
  /** Backend that produced this result. */
  readonly source: "deterministic" | "model";
  /** Tier of the model used to produce this result; `null` for deterministic. */
  readonly modelTier: ModelTier | null;
}

// ─── Heuristics (deterministic only) ─────────────────────────────────────────

const REPAIR_INTENT_REGEX = /\b(repair|broken|fix|failing|fails?|stuck|hang(?:ing)?|crashed?|error)\b/i;
const HELP_INTENT_REGEX = /\b(help|how do i|how to|what can you do|guide me|teach me|explain)\b/i;

function detectIntentType(
  input: NarrowProvidersInput,
  narrowing: NarrowProvidersResult,
): NarrowingClassifierResult["intentType"] {
  const request = (input.userRequest ?? "").toLowerCase();
  if (REPAIR_INTENT_REGEX.test(request)) return "repair";
  if (HELP_INTENT_REGEX.test(request)) return "help";

  const hasMention =
    narrowing.explicitlyMentionedProviderIds.length > 0 ||
    narrowing.aliasMatchedProviderIds.length > 0 ||
    narrowing.ambiguousInclusions.length > 0;
  const hasCanvas = (input.currentGraph?.nodes.length ?? 0) > 0;

  if (hasCanvas && hasMention) return "edit";
  if (!hasCanvas && hasMention) return "create";
  return "unknown";
}

function deriveConfidence(
  narrowing: NarrowProvidersResult,
): NarrowingClassifierResult["confidence"] {
  // Full-catalog fallback for a broad / vague / no-mention reason means
  // we don't have enough to narrow. Even if there are canvas or connected
  // providers in scope, the prompt itself doesn't tell us which one the
  // user is targeting — confidence is "low" by definition.
  if (narrowing.mode === "full-catalog" && narrowing.fallbackReason) {
    if (BROAD_FALLBACK_REASONS.has(narrowing.fallbackReason)) return "low";
    // narrowing_disabled / empty_catalog aren't user-intent signals,
    // so fall through to the explicit/alias check below — when the
    // request itself names a provider, confidence is still meaningful.
  }

  // High: the user named a provider by its canonical id. Strongest signal.
  if (narrowing.explicitlyMentionedProviderIds.length > 0) return "high";

  // Medium: alias / ambiguous capability / connected / canvas / native-logic
  // all give us SOMETHING to go on.
  if (
    narrowing.aliasMatchedProviderIds.length > 0 ||
    narrowing.ambiguousInclusions.length > 0 ||
    narrowing.connectedProviderIds.length > 0 ||
    narrowing.canvasProviderIds.length > 0
  ) {
    return "medium";
  }

  // Otherwise we have no signal at all.
  return "low";
}

const BROAD_FALLBACK_REASONS: ReadonlySet<string> = new Set([
  "ambiguous_broad_request",
  "complex_canvas_vague_edit",
  "no_provider_mention",
  "empty_user_request",
]);

function isBroadOrAmbiguous(narrowing: NarrowProvidersResult): boolean {
  if (narrowing.mode !== "full-catalog") return false;
  if (!narrowing.fallbackReason) return false;
  return BROAD_FALLBACK_REASONS.has(narrowing.fallbackReason);
}

// ─── Entry points ────────────────────────────────────────────────────────────

/**
 * Deterministic narrowing classifier. Computes the classifier-shaped
 * output from the AI-30 narrowing helper's decision + the input shape.
 * Pure, no I/O, no model call. Never throws on any input the narrowing
 * helper accepts.
 *
 * Returns `candidateProviders` as a stable, sorted-on-insertion-order
 * array of narrowing's `providerIds` Set, so dashboards that diff this
 * against narrowing's set don't see ordering noise.
 */
export function runDeterministicNarrowingClassifier(
  input: NarrowProvidersInput,
  narrowing: NarrowProvidersResult,
): NarrowingClassifierResult {
  const intentType = detectIntentType(input, narrowing);
  const confidence = deriveConfidence(narrowing);
  // Stable iteration order from the Set — narrowing inserts in a
  // documented order (explicit → alias → ambiguous → connected → canvas →
  // native), so Array.from preserves it.
  const candidateProviders = Array.from(narrowing.providerIds);
  return {
    intentType,
    confidence,
    candidateProviders,
    triggerHints: [],
    actionHints: [],
    broadOrAmbiguous: isBroadOrAmbiguous(narrowing),
    source: "deterministic",
    modelTier: null,
  };
}

/**
 * Whether the classifier feature is currently enabled. Reads
 * `process.env.ENABLE_AI_NARROWING_CLASSIFIER` at call time so
 * unit tests can toggle per case without a module reload. Default ON.
 */
export function isNarrowingClassifierEnabled(): boolean {
  return process.env.ENABLE_AI_NARROWING_CLASSIFIER !== "false";
}

/**
 * Run the classifier with the rollback flag honored + a defensive
 * try/catch around the deterministic implementation (which today
 * shouldn't throw, but a future model-backed classifier WILL be able
 * to throw — network errors, JSON parse failures, timeouts). On any
 * throw, returns `null` so the caller records `fallbackToDeterministic`
 * and continues without classifier metadata.
 *
 * When the flag is OFF, returns `null` and the caller records
 * `classifierUsed: false` + `tierRoutingReason: "classifier_disabled"`.
 */
export function safeRunNarrowingClassifier(
  input: NarrowProvidersInput,
  narrowing: NarrowProvidersResult,
): NarrowingClassifierResult | null {
  if (!isNarrowingClassifierEnabled()) return null;
  try {
    return runDeterministicNarrowingClassifier(input, narrowing);
  } catch {
    // Defensive — the deterministic implementation is pure derivation
    // and shouldn't throw, but the seam shape is what AI-31B will plug
    // a model client into, and that CAN throw.
    return null;
  }
}
