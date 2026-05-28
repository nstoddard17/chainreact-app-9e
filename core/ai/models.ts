/**
 * Centralized AI model config (Slice 4.AI-8A).
 *
 * Single source of truth for model ids, capability tiers, the default model
 * selection, and the timeout/retry + response-size budget. Mirrors V1's
 * discipline: model strings live here, never inline at call sites; no provider
 * SDK is constructed and NO API keys are stored in code.
 *
 * Purity: `core/ai/*` imports only from `contracts/` (eslint-enforced). This
 * file imports types only from the sibling `./modelTypes` and exports plain
 * data + pure selector functions — no I/O, no side effects.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

import type { AiFeature, ModelProvider, ModelTier } from "./modelTypes";

export interface ModelDefinition {
  /** Vendor model id. Config only in AI-8A — no adapter calls it yet. */
  readonly id: string;
  readonly provider: ModelProvider;
  readonly tier: ModelTier;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
}

/**
 * The model used per tier. Default vendor is Anthropic Claude (org default);
 * the shape is provider-agnostic so a tier can be repointed in one place. These
 * ids are configuration — AI-8A wires no client that calls them.
 */
export const MODELS: Readonly<Record<ModelTier, ModelDefinition>> = {
  fast: {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    tier: "fast",
    maxInputTokens: 200_000,
    maxOutputTokens: 4_096,
  },
  strong: {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    tier: "strong",
    maxInputTokens: 200_000,
    maxOutputTokens: 8_192,
  },
} as const;

/**
 * OpenAI models per tier (Slice 4.AI-34A). **Not the default planner** —
 * the React Agent stays on Anthropic (`MODELS` above) until an explicit
 * A/B / switch slice (AI-34B). These definitions exist so the OpenAI
 * adapter is wired + testable; they are only reachable via an explicit
 * `getModelForProviderTier("openai", …)` resolution, which a future
 * routing layer gates on `ENABLE_OPENAI_PROVIDER`.
 *
 * Model ids are current GPT-4.1-family defaults; the adapter sends
 * whatever `id` is here, so update these in one place if OpenAI's catalog
 * shifts. `maxInputTokens` reflects the GPT-4.1 long-context window.
 */
export const OPENAI_MODELS: Readonly<Record<ModelTier, ModelDefinition>> = {
  fast: {
    id: "gpt-4.1-mini",
    provider: "openai",
    tier: "fast",
    maxInputTokens: 1_000_000,
    // Slice 4.AI-36 — gpt-4.1-mini is now the React Agent PLANNER model, so it
    // needs a planner-grade output budget (matches the prior Sonnet planner's
    // 8192). gpt-4.1-mini supports up to 32k output, so 8192 is well within
    // limits. The AI-34C classifier sets its own small cap (400), unaffected.
    maxOutputTokens: 8_192,
  },
  strong: {
    id: "gpt-4.1",
    provider: "openai",
    tier: "strong",
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8_192,
  },
} as const;

/**
 * Every known model registry keyed by provider. The DEFAULT resolution
 * (`getModelForTier` / `getModelForFeature`) still reads `MODELS`
 * (Anthropic) — this map only powers explicit provider-aware lookups
 * (`getModelForProviderTier`) + the cross-provider `getModelById`.
 */
const MODELS_BY_PROVIDER: Readonly<
  Record<ModelProvider, Readonly<Record<ModelTier, ModelDefinition>>>
> = {
  anthropic: MODELS,
  openai: OPENAI_MODELS,
};

/** Default tier when a caller specifies neither a tier nor a known feature. */
export const DEFAULT_MODEL_TIER: ModelTier = "strong";

/** Timeout + retry budget for a single model call (used by AI-8B's adapter). */
export interface ModelBudget {
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export const DEFAULT_MODEL_BUDGET: ModelBudget = {
  timeoutMs: 60_000,
  maxRetries: 2,
};

/**
 * Default tier per AI feature. Generation/reasoning-heavy features get `strong`;
 * read/summarize features get `fast`. Callers may override via
 * `ModelGenerateInput.tier`.
 */
export const FEATURE_DEFAULT_TIER: Readonly<Record<AiFeature, ModelTier>> = {
  creation: "strong",
  editing: "strong",
  repair: "strong",
  explanation: "fast",
  run_analysis: "fast",
  data_qa: "fast",
  discovery: "fast",
} as const;

/**
 * Env var NAMES the real adapter (AI-8B/AI-8C) will read its keys from. Listing
 * the NAMES here — never values — keeps the key location centralized without
 * embedding a secret. AI-8A reads none of these.
 */
export const MODEL_API_KEY_ENV: Readonly<Record<ModelProvider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

/** The model for a capability tier. Default provider (Anthropic). */
export function getModelForTier(tier: ModelTier): ModelDefinition {
  return MODELS[tier];
}

/**
 * The model for an explicit provider + tier (Slice 4.AI-34A). Used by the
 * provider-specific adapters to resolve their own registry — e.g. the
 * OpenAI adapter resolves `getModelForProviderTier("openai", tier)` so it
 * never accidentally serves an Anthropic model id. The DEFAULT planner
 * path does NOT call this (it uses `getModelForTier` / `getModelForFeature`,
 * which stay Anthropic), so adding OpenAI here changes no default behavior.
 */
export function getModelForProviderTier(
  provider: ModelProvider,
  tier: ModelTier,
): ModelDefinition {
  return MODELS_BY_PROVIDER[provider][tier];
}

/**
 * The model for a feature. Falls back to {@link DEFAULT_MODEL_TIER} for an
 * unrecognized feature value (defensive — the union should make this
 * unreachable at the type level, but runtime callers can pass anything).
 */
export function getModelForFeature(feature: AiFeature): ModelDefinition {
  const tier = FEATURE_DEFAULT_TIER[feature] ?? DEFAULT_MODEL_TIER;
  return MODELS[tier];
}

/**
 * Look up a model by its vendor id across ALL provider registries
 * (Anthropic + OpenAI). Returns `undefined` for an unknown id. Used by
 * the cost-event recorder to derive `model_provider` from `model_name`,
 * so an OpenAI call's telemetry resolves to `provider: "openai"` (Slice
 * 4.AI-34A).
 */
export function getModelById(id: string): ModelDefinition | undefined {
  for (const registry of Object.values(MODELS_BY_PROVIDER)) {
    const found = Object.values(registry).find((m) => m.id === id);
    if (found) return found;
  }
  return undefined;
}
