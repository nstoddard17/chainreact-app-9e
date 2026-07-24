import type { AiFeature, ModelClient, ModelTier } from "@/core/ai/modelTypes";
import { createRuntimeModelClient } from "@/services/ai/modelClients/createModelClient";
import { getAiProcessorConfig, isAiProcessorEnabled } from "./config";
import { buildFirstPartyRequestShape } from "./requestShapes";
import { resultValidatorFor } from "./responseSchemas";
import type {
  AiProcessorClient,
  AiProcessorFailureCode,
  AiProcessRequest,
  AiProcessResult,
} from "./types";

/**
 * First-party AiProcessorClient (AI-PROVIDER-2 CS-2) — the swap-in
 * implementation that rides the existing model-client layer
 * (`services/ai/modelClients/*`, forced tool-use structured JSON). No
 * provider SDK is wired here; vendor/model selection stays inside
 * `createRuntimeModelClient` + the routing flags it already honors
 * (OpenAI live behind ENABLE_OPENAI_PROVIDER; Anthropic cost-disabled).
 *
 * Parity: the SAME `requestShapes` render and the SAME `responseSchemas`
 * validator as the gateway path — a request that validates on one path
 * validates identically on the other (asserted by test).
 *
 * The model call is tagged with the REAL capability feature supplied by
 * the AI action registry (AI-PROVIDER-3 CS-3 removed the interim `data_qa`
 * placeholder), so model-layer telemetry, the credit charge, and the
 * ledger row all key off one feature name.
 */

export interface FirstPartyProcessorDeps {
  /**
   * The capability's feature key (registry-declared). Drives the model
   * layer's default tier + telemetry tagging. Defaults to
   * `document_analysis` only so a direct construction in a test is
   * ergonomic; `executeAiAction` always passes the registry value.
   */
  readonly feature?: AiFeature;
  /** Injectable for tests; defaults to the runtime model client. */
  readonly modelClient?: ModelClient;
  /** Tier for the underlying model call (from the resolved route). */
  readonly tier?: ModelTier;
}

const MODEL_FAILURE_TO_PROCESSOR: Record<
  string,
  { code: AiProcessorFailureCode; retryable: boolean }
> = {
  NOT_CONFIGURED: { code: "NOT_CONFIGURED", retryable: false },
  CONFIGURATION_ERROR: { code: "NOT_CONFIGURED", retryable: false },
  TIMEOUT: { code: "TIMEOUT", retryable: true },
  RATE_LIMITED: { code: "RATE_LIMITED", retryable: true },
  PROVIDER_ERROR: { code: "PROVIDER_ERROR", retryable: true },
  NETWORK_ERROR: { code: "PROVIDER_ERROR", retryable: true },
  INVALID_RESPONSE: { code: "INVALID_RESPONSE", retryable: false },
  EMPTY_RESPONSE: { code: "INVALID_RESPONSE", retryable: false },
  INVALID_INPUT: { code: "PROVIDER_ERROR", retryable: false },
};

export function createFirstPartyProcessorClient(
  deps: FirstPartyProcessorDeps = {},
): AiProcessorClient {
  return {
    async process(request: AiProcessRequest): Promise<AiProcessResult> {
      if (!isAiProcessorEnabled()) {
        return {
          ok: false,
          code: "DISABLED",
          retryable: false,
          message: "The AI processor is not enabled on this environment.",
        };
      }
      if (!getAiProcessorConfig()) {
        return {
          ok: false,
          code: "NOT_CONFIGURED",
          retryable: false,
          message: "The AI processor is not fully configured.",
        };
      }

      const feature: AiFeature = deps.feature ?? "document_analysis";
      const shape = buildFirstPartyRequestShape(request);
      const client =
        deps.modelClient ??
        createRuntimeModelClient(
          deps.tier ? { feature, tier: deps.tier } : { feature },
        );

      const result = await client.generateStructuredJson({
        feature,
        ...(deps.tier ? { tier: deps.tier } : {}),
        messages: shape.messages,
        responseTool: shape.responseTool,
        maxOutputTokens: request.limits.maxOutputTokens,
      });

      if (!result.ok) {
        const mapped = MODEL_FAILURE_TO_PROCESSOR[result.failureCode] ?? {
          code: "PROVIDER_ERROR" as const,
          retryable: false,
        };
        return {
          ok: false,
          code: mapped.code,
          retryable: mapped.retryable,
          // result.message is already caller-safe per the ModelFailure contract.
          message: result.message,
        };
      }

      if (result.finishReason === "content_filter") {
        return {
          ok: false,
          code: "CONTENT_REFUSED",
          retryable: false,
          message: "The AI declined to process this content.",
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        return {
          ok: false,
          code: "INVALID_RESPONSE",
          retryable: false,
          message: "The model reply was not valid JSON.",
        };
      }
      const validated = resultValidatorFor(request).safeParse(parsed);
      if (!validated.success) {
        return {
          ok: false,
          code: "INVALID_RESPONSE",
          retryable: false,
          message: "The model result did not match the task's output contract.",
        };
      }
      return {
        ok: true,
        payload: validated.data,
        ...(result.usage
          ? {
              usage: {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
              },
            }
          : {}),
        modelTag: result.modelId,
        source: "first_party",
      };
    },
  };
}
