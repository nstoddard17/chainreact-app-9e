/**
 * Hosted Hermes guidance config reader (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * PLACEHOLDER config: reads the HERMES_* env vars Marcus will provide later (see
 * docs/runbooks/hosted-hermes-setup.md). Pure reader — it constructs NO client and makes
 * NO network call (mirrors the lazy-client rule). Returns `null` when any REQUIRED var is
 * missing, so an unconfigured environment is the safe default (the adapter reports
 * `PROVIDER_NOT_CONFIGURED`). Tests never need real values — they assert the null/parse paths.
 */

/** The env var NAMES this slice reserves. Values are NOT required for tests/typecheck/build. */
export const HERMES_ENV = {
  baseUrl: "HERMES_BASE_URL",
  apiKey: "HERMES_API_KEY",
  model: "HERMES_MODEL",
  timeoutMs: "HERMES_TIMEOUT_MS",
  providerFormat: "HERMES_PROVIDER_FORMAT",
} as const;

export interface HermesGuidanceConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** Request timeout (ms). Defaults to 15s when unset/invalid. */
  readonly timeoutMs: number;
  /** Wire format Marcus confirms later (e.g. "openai-compatible"). Default placeholder. */
  readonly providerFormat: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PROVIDER_FORMAT = "openai-compatible";

/**
 * Build the Hermes config from env, or `null` if `HERMES_BASE_URL` / `HERMES_API_KEY` /
 * `HERMES_MODEL` are not all present. Never throws; never logs the key.
 */
export function getHermesGuidanceConfig(): HermesGuidanceConfig | null {
  const baseUrl = process.env[HERMES_ENV.baseUrl]?.trim();
  const apiKey = process.env[HERMES_ENV.apiKey]?.trim();
  const model = process.env[HERMES_ENV.model]?.trim();
  if (!baseUrl || !apiKey || !model) return null;

  const rawTimeout = Number(process.env[HERMES_ENV.timeoutMs]);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;
  const providerFormat = process.env[HERMES_ENV.providerFormat]?.trim() || DEFAULT_PROVIDER_FORMAT;

  return { baseUrl, apiKey, model, timeoutMs, providerFormat };
}
