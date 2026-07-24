import type { AiProcessorProvider } from "./types";

/**
 * Server-only AI processor config reader (AI-PROVIDER-2 CS-2).
 *
 * Mirrors `services/ai-guidance/gateway/gatewayConfig.ts` exactly: a pure
 * reader that constructs no client and makes no network call; returns
 * `null` when disabled or unconfigured so the unconfigured environment is
 * the safe default. The gateway token is read but NEVER logged, returned
 * in a status object, or stringified.
 *
 * Deliberately independent of `HERMES_AGENT_ENABLED` — guidance and the
 * AI processor roll out on separate levers. The gateway URL/token vars ARE
 * shared (same Render service).
 *
 * SERVER-ONLY: reads server secrets from `process.env`; must never be
 * imported by a browser/client module (structure-test guarded).
 */

/** Env var NAMES this layer reads. Values never required for tests/build. */
export const AI_PROCESSOR_ENV = {
  enabled: "AI_PROCESSOR_ENABLED",
  provider: "AI_PROCESSOR_PROVIDER",
  timeoutMs: "AI_PROCESSOR_TIMEOUT_MS",
  maxInputChars: "AI_PROCESSOR_MAX_INPUT_CHARS",
  gatewayUrl: "CHAINREACT_AI_GATEWAY_URL",
  gatewayToken: "CHAINREACT_AI_GATEWAY_TOKEN",
} as const;

const DEFAULT_TIMEOUT_MS = 60_000;
const TIMEOUT_MIN_MS = 5_000;
const TIMEOUT_MAX_MS = 120_000;
const DEFAULT_MAX_INPUT_CHARS = 150_000;
const MAX_INPUT_CHARS_MIN = 1_000;
const MAX_INPUT_CHARS_MAX = 500_000;

export interface AiProcessorConfig {
  readonly provider: AiProcessorProvider;
  readonly timeoutMs: number;
  readonly maxInputChars: number;
  /** Present only when `provider === "gateway"`. Token is header-only. */
  readonly gateway?: {
    readonly url: string;
    /** Server-only secret. Never logged / never in a body or status. */
    readonly token: string;
  };
}

function num(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Read at call time so tests/rollout toggle without re-import. DEFAULT OFF. */
export function isAiProcessorEnabled(): boolean {
  return process.env[AI_PROCESSOR_ENV.enabled] === "true";
}

/**
 * Build the processor config from env, or `null` when disabled OR the
 * configuration is incomplete/invalid:
 *   - unset/empty provider → defaults to "gateway";
 *   - an UNRECOGNIZED provider value fails CLOSED (null — NOT_CONFIGURED),
 *     never silently coerced;
 *   - provider "gateway" additionally requires the gateway URL + token.
 * Never throws; never logs the token.
 */
export function getAiProcessorConfig(): AiProcessorConfig | null {
  if (!isAiProcessorEnabled()) return null;

  const rawProvider = process.env[AI_PROCESSOR_ENV.provider]?.trim();
  let provider: AiProcessorProvider;
  if (rawProvider === undefined || rawProvider === "") {
    provider = "gateway";
  } else if (rawProvider === "gateway" || rawProvider === "first_party") {
    provider = rawProvider;
  } else {
    return null; // unknown provider value — fail closed, not coerced
  }

  const timeoutMs = num(
    process.env[AI_PROCESSOR_ENV.timeoutMs],
    DEFAULT_TIMEOUT_MS,
    TIMEOUT_MIN_MS,
    TIMEOUT_MAX_MS,
  );
  const maxInputChars = num(
    process.env[AI_PROCESSOR_ENV.maxInputChars],
    DEFAULT_MAX_INPUT_CHARS,
    MAX_INPUT_CHARS_MIN,
    MAX_INPUT_CHARS_MAX,
  );

  if (provider === "gateway") {
    const url = process.env[AI_PROCESSOR_ENV.gatewayUrl]?.trim();
    const token = process.env[AI_PROCESSOR_ENV.gatewayToken]?.trim();
    if (!url || !token) return null;
    return { provider, timeoutMs, maxInputChars, gateway: { url, token } };
  }
  return { provider, timeoutMs, maxInputChars };
}

/** SAFE status — flag + presence + missing var NAMES only. NEVER the token. */
export interface AiProcessorConfigStatus {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly missing: readonly string[];
}

export function describeAiProcessorConfigStatus(): AiProcessorConfigStatus {
  const enabled = isAiProcessorEnabled();
  const missing: string[] = [];
  const rawProvider = process.env[AI_PROCESSOR_ENV.provider]?.trim();
  const provider = rawProvider === undefined || rawProvider === "" ? "gateway" : rawProvider;
  if (provider !== "gateway" && provider !== "first_party") {
    missing.push(AI_PROCESSOR_ENV.provider);
  } else if (provider === "gateway") {
    if (!process.env[AI_PROCESSOR_ENV.gatewayUrl]?.trim()) missing.push(AI_PROCESSOR_ENV.gatewayUrl);
    if (!process.env[AI_PROCESSOR_ENV.gatewayToken]?.trim()) missing.push(AI_PROCESSOR_ENV.gatewayToken);
  }
  return { enabled, configured: enabled && missing.length === 0, missing };
}
