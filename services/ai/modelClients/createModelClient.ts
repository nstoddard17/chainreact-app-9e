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
  getModelForTier,
  MODEL_API_KEY_ENV,
  type ModelDefinition,
} from "@/core/ai/models";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResult,
} from "@/core/ai/modelTypes";
import { createAnthropicModelClient } from "./anthropicClient";
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
 * Select a concrete client for a resolved model + the provider's API key.
 * Exported so every branch (real adapter / NOT_CONFIGURED / CONFIGURATION_ERROR)
 * is unit-testable with a synthetic model — without mutating the global config.
 */
export function createModelClientForModel(
  model: ModelDefinition,
  apiKey: string | undefined,
): ModelClient {
  if (model.provider === "anthropic") {
    if (!apiKey) return createNotConfiguredModelClient();
    return createAnthropicModelClient({ apiKey });
  }
  // No real adapter for this provider yet (e.g. OpenAI) — fail safe.
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
