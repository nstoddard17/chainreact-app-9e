/**
 * Hosted Hermes guidance config reader + validation (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * Reads the HERMES_* env vars (see docs/runbooks/hosted-hermes-setup.md). Pure reader — it
 * constructs NO client and makes NO network call (lazy-client rule). Returns `null` when any
 * REQUIRED var is missing, so an unconfigured environment is the safe default (the adapter
 * reports `PROVIDER_NOT_CONFIGURED`). Tests never need real values.
 *
 * SECRET DISCIPLINE: `HERMES_API_KEY` is a server-only secret — it MUST NOT have a
 * `NEXT_PUBLIC_` prefix, and it is NEVER logged, returned in a status object, or stringified.
 * `describeHermesConfigStatus()` reports presence/missing var NAMES only, never the key value.
 */

/** The env var NAMES this slice reads. Values are NOT required for tests/typecheck/build. */
export const HERMES_ENV = {
  provider: "HERMES_PROVIDER",
  baseUrl: "HERMES_BASE_URL",
  apiKey: "HERMES_API_KEY",
  model: "HERMES_MODEL",
  timeoutMs: "HERMES_TIMEOUT_MS",
  maxOutputTokens: "HERMES_MAX_OUTPUT_TOKENS",
  temperature: "HERMES_TEMPERATURE",
} as const;

/** Required vars without which the adapter cannot run (and stays `PROVIDER_NOT_CONFIGURED`). */
export const HERMES_REQUIRED_VARS = [HERMES_ENV.baseUrl, HERMES_ENV.apiKey, HERMES_ENV.model] as const;

export interface HermesGuidanceConfig {
  /** Provider name (e.g. "nous"). Selects the adapter wire format. */
  readonly provider: string;
  readonly baseUrl: string;
  /** Server-only secret. Never logged / never placed in a status or prompt. */
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly temperature: number;
}

const DEFAULT_PROVIDER = "nous";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
const DEFAULT_TEMPERATURE = 0.3;

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Build the Hermes config from env, or `null` if any of `HERMES_REQUIRED_VARS` is missing.
 * Never throws; never logs the key.
 */
export function getHermesGuidanceConfig(): HermesGuidanceConfig | null {
  const baseUrl = process.env[HERMES_ENV.baseUrl]?.trim();
  const apiKey = process.env[HERMES_ENV.apiKey]?.trim();
  const model = process.env[HERMES_ENV.model]?.trim();
  if (!baseUrl || !apiKey || !model) return null;

  const provider = process.env[HERMES_ENV.provider]?.trim() || DEFAULT_PROVIDER;
  const timeoutMs = num(process.env[HERMES_ENV.timeoutMs], DEFAULT_TIMEOUT_MS, 1_000, 120_000);
  const maxOutputTokens = num(process.env[HERMES_ENV.maxOutputTokens], DEFAULT_MAX_OUTPUT_TOKENS, 1, 8_192);
  const temperature = num(process.env[HERMES_ENV.temperature], DEFAULT_TEMPERATURE, 0, 2);

  return { provider, baseUrl, apiKey, model, timeoutMs, maxOutputTokens, temperature };
}

/** SAFE config status — presence + missing var NAMES only. NEVER includes the key value. */
export interface HermesConfigStatus {
  readonly configured: boolean;
  readonly provider: string | null;
  /** Names (not values) of required vars that are unset. */
  readonly missing: readonly string[];
}

export function describeHermesConfigStatus(): HermesConfigStatus {
  const missing = HERMES_REQUIRED_VARS.filter((v) => !process.env[v]?.trim());
  return {
    configured: missing.length === 0,
    provider: process.env[HERMES_ENV.provider]?.trim() || (missing.length === 0 ? DEFAULT_PROVIDER : null),
    missing,
  };
}
