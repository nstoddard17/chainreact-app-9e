import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getAiProcessorConfig, isAiProcessorEnabled, type AiProcessorConfig } from "./config";
import {
  buildGatewayProcessBody,
  GATEWAY_MAX_BODY_BYTES,
  GATEWAY_PROCESS_PATH,
} from "./requestShapes";
import { resultValidatorFor } from "./responseSchemas";
import type {
  AiProcessorClient,
  AiProcessorFailureCode,
  AiProcessRequest,
  AiProcessResult,
} from "./types";

/**
 * Hermes-gateway AiProcessorClient (AI-PROVIDER-2 CS-2).
 *
 *   POST ${CHAINREACT_AI_GATEWAY_URL}/api/hermes-agent/process
 *   Authorization: Bearer ${CHAINREACT_AI_GATEWAY_TOKEN}
 *
 * Mirrors `hermesAgentGatewayClient.ts` discipline exactly: token ONLY in
 * the Authorization header (never body / logs / results); injectable
 * `fetchImpl` so tests run the full request/parse path with no live
 * network; never throws — every transport/parse failure maps to a typed
 * code; the envelope normalizer is STRICT and fails closed.
 *
 * Gateway-reported `usage` is telemetry only — never authoritative for
 * billing (credits are charged by `aiCreditGate` before the call).
 */

export interface GatewayHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type GatewayFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<GatewayHttpResponse>;

export interface GatewayProcessorDeps {
  /** Defaults to global fetch. Tests inject a mock — no live call in CI. */
  readonly fetchImpl?: GatewayFetch;
}

/** Short uppercase gateway error codes (same grammar as the guidance path). */
const GATEWAY_ERROR_CODE = /^[A-Z0-9_]{1,40}$/;

/**
 * STRICT transport envelope. Success must be exactly
 * `{ ok:true, result:<object>, usage?, modelTag? }` — unknown top-level
 * keys fail closed (INVALID_RESPONSE), unlike the tolerant guidance
 * normalizer, because this contract is new and versioned.
 */
const GatewaySuccessEnvelope = z
  .object({
    ok: z.literal(true),
    result: z.record(z.string(), z.unknown()),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().optional(),
        completion_tokens: z.number().int().nonnegative().optional(),
        total_tokens: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    modelTag: z.string().min(1).max(120).optional(),
  })
  .strict();

const GatewayFailureEnvelope = z
  .object({
    ok: z.literal(false),
    error: z.string().regex(GATEWAY_ERROR_CODE),
  })
  .strict();

function mapGatewayErrorCode(code: string): {
  code: AiProcessorFailureCode;
  retryable: boolean;
  message: string;
} {
  switch (code) {
    case "INPUT_TOO_LARGE":
      return {
        code: "INPUT_TOO_LARGE",
        retryable: false,
        message: "The request was too large for the AI service.",
      };
    case "RATE_LIMITED":
      return {
        code: "RATE_LIMITED",
        retryable: true,
        message: "The AI service is rate limiting requests.",
      };
    case "CONTENT_REFUSED":
      return {
        code: "CONTENT_REFUSED",
        retryable: false,
        message: "The AI declined to process this content.",
      };
    case "SCHEMA_UNSATISFIABLE":
      return {
        code: "INVALID_RESPONSE",
        retryable: false,
        message: "The AI could not produce a result matching the required shape.",
      };
    case "UNSUPPORTED_TASK":
      return {
        code: "PROVIDER_ERROR",
        retryable: false,
        message: "The AI service does not support this task yet.",
      };
    default:
      // MODEL_ERROR / INTERNAL / future codes — sanitized, generally retryable.
      return {
        code: "PROVIDER_ERROR",
        retryable: true,
        message: `The AI service reported an error (${code}).`,
      };
  }
}

function defaultFetch(): GatewayFetch {
  return globalThis.fetch as unknown as GatewayFetch;
}

/** Exported for tests/fixture parity — normalizes one parsed reply. */
export function normalizeGatewayProcessResponse(
  parsed: unknown,
  request: AiProcessRequest,
): AiProcessResult {
  const failure = GatewayFailureEnvelope.safeParse(parsed);
  if (failure.success) {
    return { ok: false, ...mapGatewayErrorCode(failure.data.error) };
  }
  const success = GatewaySuccessEnvelope.safeParse(parsed);
  if (!success.success) {
    return {
      ok: false,
      code: "INVALID_RESPONSE",
      retryable: false,
      message: "The AI service reply did not match the expected envelope.",
    };
  }
  const validated = resultValidatorFor(request).safeParse(success.data.result);
  if (!validated.success) {
    return {
      ok: false,
      code: "INVALID_RESPONSE",
      retryable: false,
      message: "The AI service result did not match the task's output contract.",
    };
  }
  const usage = success.data.usage;
  return {
    ok: true,
    payload: validated.data,
    ...(usage
      ? {
          usage: {
            ...(usage.prompt_tokens !== undefined ? { inputTokens: usage.prompt_tokens } : {}),
            ...(usage.completion_tokens !== undefined
              ? { outputTokens: usage.completion_tokens }
              : {}),
          },
        }
      : {}),
    modelTag: success.data.modelTag ?? "gateway",
    source: "gateway",
  };
}

async function processViaGateway(
  request: AiProcessRequest,
  config: AiProcessorConfig,
  fetchImpl: GatewayFetch,
): Promise<AiProcessResult> {
  const gateway = config.gateway;
  if (!gateway) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      retryable: false,
      message: "The AI gateway is not configured.",
    };
  }

  const body = JSON.stringify(buildGatewayProcessBody(request, `aip-${randomUUID()}`));
  if (Buffer.byteLength(body, "utf8") > GATEWAY_MAX_BODY_BYTES) {
    return {
      ok: false,
      code: "INPUT_TOO_LARGE",
      retryable: false,
      message: "The request exceeds the AI service's size limit.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(
      `${gateway.url.replace(/\/$/, "")}${GATEWAY_PROCESS_PATH}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Token lives ONLY here — never in the body, never logged.
          authorization: `Bearer ${gateway.token}`,
        },
        body,
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      if (res.status === 429) {
        return {
          ok: false,
          code: "RATE_LIMITED",
          retryable: true,
          message: "The AI service is rate limiting requests.",
        };
      }
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        retryable: res.status >= 500,
        message: `The AI service returned status ${res.status}.`,
      };
    }
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        retryable: false,
        message: "The AI service returned a non-JSON reply.",
      };
    }
    return normalizeGatewayProcessResponse(parsed, request);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted
      ? {
          ok: false,
          code: "TIMEOUT",
          retryable: true,
          message: "The AI service did not respond in time.",
        }
      : {
          ok: false,
          code: "PROVIDER_ERROR",
          retryable: true,
          message: "The AI service could not be reached.",
        };
  } finally {
    clearTimeout(timer);
  }
}

/** The gateway-backed AiProcessorClient. Disabled/unconfigured → typed, no network. */
export function createGatewayProcessorClient(
  deps: GatewayProcessorDeps = {},
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
      const config = getAiProcessorConfig();
      if (!config) {
        return {
          ok: false,
          code: "NOT_CONFIGURED",
          retryable: false,
          message: "The AI processor is not fully configured.",
        };
      }
      return processViaGateway(request, config, deps.fetchImpl ?? defaultFetch());
    },
  };
}
