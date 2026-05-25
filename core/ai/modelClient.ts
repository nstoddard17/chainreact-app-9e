/**
 * Model client factories (Slice 4.AI-8A).
 *
 * Provider-agnostic {@link ModelClient} implementations that perform NO network
 * I/O — purity-safe for `core/`:
 *   - `createNotConfiguredModelClient()` — always resolves a NOT_CONFIGURED
 *     failure. The honest default until a real adapter is wired (AI-8B/AI-8C).
 *   - `createMockModelClient()` — deterministic in-memory client for tests and
 *     for the future mock-driven planner, with a recorded `calls` log.
 *
 * The real OpenAI/Anthropic adapter (which DOES make network calls) lands in a
 * later slice and lives OUTSIDE `core/` because `core/` may not perform I/O.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

import { getModelForFeature, getModelForTier, type ModelDefinition } from "./models";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResult,
} from "./modelTypes";

/** Resolve the model a request targets (explicit tier wins over feature default). */
function resolveModel(input: ModelGenerateInput): ModelDefinition {
  return input.tier ? getModelForTier(input.tier) : getModelForFeature(input.feature);
}

/**
 * A client that never calls a provider — every request resolves to a
 * NOT_CONFIGURED failure. This is the default model client in AI-8A: the
 * boundary, config, and contract exist, but no provider is wired yet.
 */
export function createNotConfiguredModelClient(): ModelClient {
  return {
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      const model = resolveModel(input);
      return {
        ok: false,
        modelId: model.id,
        feature: input.feature,
        failureCode: "NOT_CONFIGURED",
        message:
          "No model provider adapter is configured. Real model wiring lands in a later slice (AI-8B/AI-8C).",
        latencyMs: 0,
      };
    },
  };
}

export interface MockModelCall {
  readonly input: ModelGenerateInput;
}

export interface MockModelClient extends ModelClient {
  /** Every request this client received, in order. */
  readonly calls: readonly MockModelCall[];
}

export interface CreateMockModelClientOptions {
  /**
   * A fixed result, or a function computing one per call (receives the request
   * and its zero-based call index). When omitted, the client returns a trivial
   * `{}` JSON success so callers can exercise the happy path deterministically.
   */
  readonly respond?:
    | ModelResult
    | ((input: ModelGenerateInput, callIndex: number) => ModelResult);
  /** Convenience success text. Ignored when `respond` is provided. */
  readonly text?: string;
  /** Override the reported model id. Defaults to the resolved model's id. */
  readonly modelId?: string;
}

/**
 * Deterministic in-memory {@link ModelClient}. No network, no randomness, no
 * timers — safe in unit tests. Records every request in `calls`.
 */
export function createMockModelClient(
  options: CreateMockModelClientOptions = {},
): MockModelClient {
  const calls: MockModelCall[] = [];

  return {
    calls,
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      calls.push({ input });

      if (typeof options.respond === "function") {
        return options.respond(input, calls.length - 1);
      }
      if (options.respond) {
        return options.respond;
      }

      const model = resolveModel(input);
      return {
        ok: true,
        modelId: options.modelId ?? model.id,
        feature: input.feature,
        text: options.text ?? "{}",
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
      };
    },
  };
}
