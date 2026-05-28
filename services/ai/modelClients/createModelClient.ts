/**
 * Runtime model-client factory (Slice 4.AI-8C).
 *
 * Turns the centralized model CONFIG (`core/ai/models`) + environment into a
 * concrete `ModelClient`, failing SAFE when nothing is configured:
 *   - missing API key for the target provider → `createNotConfiguredModelClient`
 *     (every call resolves NOT_CONFIGURED);
 *   - a provider with no implemented adapter (e.g. OpenAI today) → a client that
 *     resolves CONFIGURATION_ERROR;
 *   - a configured provider with a key → the real adapter (Anthropic).
 *
 * It NEVER throws at module load or call time for missing keys — absent AI
 * config must not crash the app. Env is read at call time so tests + config
 * changes take effect without a reload. The API key value is never returned,
 * logged, or echoed.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

import { createNotConfiguredModelClient } from "@/core/ai/modelClient";
import {
  getModelForFeature,
  getModelForProviderTier,
  getModelForTier,
  MODEL_API_KEY_ENV,
  type ModelDefinition,
} from "@/core/ai/models";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResult,
  ModelTier,
} from "@/core/ai/modelTypes";
import { createAnthropicModelClient } from "./anthropicClient";
import { createOpenAiModelClient } from "./openaiClient";
import type { RuntimeModelClientInput } from "./types";

/** A client whose every call fails CONFIGURATION_ERROR (no adapter for provider). */
function createConfigurationErrorClient(provider: string): ModelClient {
  return {
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      const model = input.tier
        ? getModelForTier(input.tier)
        : getModelForFeature(input.feature);
      return {
        ok: false,
        modelId: model.id,
        feature: input.feature,
        failureCode: "CONFIGURATION_ERROR",
        message: `No model adapter is implemented for provider '${provider}'.`,
        retryable: false,
      };
    },
  };
}

/**
 * Slice 4.AI-34A — whether the OpenAI provider is enabled for routing.
 * Read at call time (default OFF). This gates a FUTURE routing layer
 * (AI-34B); the DEFAULT planner path never resolves an OpenAI model, so
 * this flag does not change any current behavior. Kept here (services
 * layer) rather than `core/ai` because reading env is impure.
 */
export function isOpenAiProviderEnabled(): boolean {
  return process.env.ENABLE_OPENAI_PROVIDER === "true";
}

/**
 * Select a concrete client for a resolved model + the provider's API key.
 * Exported so every branch (real adapter / NOT_CONFIGURED) is unit-testable
 * with a synthetic model — without mutating the global config.
 *
 * Slice 4.AI-34A — OpenAI joins Anthropic as a real adapter. Both fail
 * SAFE: present provider + present key → real adapter; provider with a
 * missing key → NOT_CONFIGURED (never throws, never blocks the app). A
 * provider with NO implemented adapter still degrades to CONFIGURATION_ERROR.
 */
export function createModelClientForModel(
  model: ModelDefinition,
  apiKey: string | undefined,
): ModelClient {
  if (model.provider === "anthropic") {
    if (!apiKey) return createNotConfiguredModelClient();
    return createAnthropicModelClient({ apiKey });
  }
  if (model.provider === "openai") {
    if (!apiKey) return createNotConfiguredModelClient();
    return createOpenAiModelClient({ apiKey });
  }
  // No real adapter for this provider yet — fail safe.
  return createConfigurationErrorClient(model.provider);
}

/**
 * Build the configured runtime client for a feature/tier. Resolves the target
 * model from `core/ai/models`, reads the provider's API key env var at call
 * time, and returns the appropriate fail-safe client.
 */
export function createRuntimeModelClient(
  input: RuntimeModelClientInput,
): ModelClient {
  const model = input.tier
    ? getModelForTier(input.tier)
    : getModelForFeature(input.feature);
  const apiKey = process.env[MODEL_API_KEY_ENV[model.provider]];
  return createModelClientForModel(model, apiKey);
}

/** Convenience wrapper: the runtime client for a feature (default tier). */
export function createModelClientForFeature(
  feature: RuntimeModelClientInput["feature"],
  tier?: RuntimeModelClientInput["tier"],
): ModelClient {
  return createRuntimeModelClient(tier ? { feature, tier } : { feature });
}

// ─── Slice 4.AI-36: React Agent planner provider routing ─────────────────────

/**
 * Whether OpenAI is the React Agent PLANNER provider. Read at call time
 * (default OFF). When true (AND `ENABLE_OPENAI_PROVIDER` + `OPENAI_API_KEY`),
 * the planner routes to OpenAI; Anthropic is NOT called.
 */
export function isOpenAiPlannerEnabled(): boolean {
  return process.env.ENABLE_OPENAI_PLANNER === "true";
}

/**
 * EMERGENCY / DEV ONLY (default OFF). When true, the planner may use Anthropic
 * — the ONLY runtime path that calls Anthropic after AI-36. Marcus disabled
 * Anthropic at runtime for cost; this flag exists for emergency/debug use.
 */
export function isAnthropicPlannerFallbackEnabled(): boolean {
  return process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK === "true";
}

export type PlannerProvider = "openai" | "anthropic" | "none";

export interface PlannerModelClientResult {
  readonly client: ModelClient;
  /** Which provider will actually serve the call (`none` → NOT_CONFIGURED). */
  readonly provider: PlannerProvider;
  readonly tier: ModelTier;
  readonly modelId: string;
  /** Output-token budget for the planner request (the resolved model's cap). */
  readonly maxOutputTokens: number;
}

/**
 * Slice 4.AI-36 — resolve the React Agent PLANNER's model client.
 *
 * Routing (no silent Anthropic fallback):
 *   1. OpenAI planner enabled + provider enabled → OpenAI (`gpt-4.1-mini`, the
 *      `fast` tier). With no key, `createModelClientForModel` returns the
 *      NOT_CONFIGURED client — still NOT Anthropic.
 *   2. Else if the explicit emergency flag is set → Anthropic (dormant default).
 *   3. Else → NOT_CONFIGURED (the existing "model unavailable" flow). NEVER
 *      Anthropic.
 *
 * Anthropic code stays available; only this routing decides whether it runs.
 */
export function createPlannerModelClient(
  input: RuntimeModelClientInput,
): PlannerModelClientResult {
  if (isOpenAiPlannerEnabled() && isOpenAiProviderEnabled()) {
    const tier: ModelTier = input.tier ?? "fast";
    const model = getModelForProviderTier("openai", tier);
    const apiKey = process.env[MODEL_API_KEY_ENV.openai];
    return {
      client: createModelClientForModel(model, apiKey),
      provider: "openai",
      tier,
      modelId: model.id,
      maxOutputTokens: model.maxOutputTokens,
    };
  }

  if (isAnthropicPlannerFallbackEnabled()) {
    const tier: ModelTier = input.tier ?? getModelForFeature(input.feature).tier;
    const model = getModelForTier(tier);
    const apiKey = process.env[MODEL_API_KEY_ENV.anthropic];
    return {
      client: createModelClientForModel(model, apiKey),
      provider: "anthropic",
      tier,
      modelId: model.id,
      maxOutputTokens: model.maxOutputTokens,
    };
  }

  // Neither enabled → model-unavailable. Report an OpenAI id (the intended
  // provider) and a NOT_CONFIGURED client — Anthropic is never constructed.
  const tier: ModelTier = input.tier ?? "fast";
  const model = getModelForProviderTier("openai", tier);
  return {
    client: createNotConfiguredModelClient(),
    provider: "none",
    tier,
    modelId: model.id,
    maxOutputTokens: model.maxOutputTokens,
  };
}
