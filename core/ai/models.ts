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

/** The model for a capability tier. */
export function getModelForTier(tier: ModelTier): ModelDefinition {
  return MODELS[tier];
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

/** Look up a model by its vendor id. Returns `undefined` for an unknown id. */
export function getModelById(id: string): ModelDefinition | undefined {
  return Object.values(MODELS).find((m) => m.id === id);
}
