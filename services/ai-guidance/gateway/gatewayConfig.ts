/**
 * Server-only Hermes Agent GATEWAY config reader (HERMES-AGENT-PROD-CLIENT).
 *
 * ChainReact (on Vercel) talks ONLY to the public, ChainReact-owned Render AI Gateway
 * (`chainreact-ai-gateway-prod`). The gateway fronts the private Render Hermes Agent + its model
 * vendor. ChainReact never calls the model vendor or the private Hermes Agent directly, and never
 * holds the model-vendor API key, the Render API server key, the private Hermes Agent URL, or the
 * internal Render token — those live only on Render. The only secret ChainReact holds for this path
 * is the gateway token (`CHAINREACT_AI_GATEWAY_TOKEN`).
 *
 * Pure reader — constructs NO client and makes NO network call (lazy-client rule). Returns `null`
 * when disabled or unconfigured, so a normal (unconfigured) environment is the safe default and
 * tests/typecheck/build never need real values. Secret discipline: the gateway token is read but
 * NEVER logged, returned in a status object, or stringified.
 *
 * SERVER-ONLY: this module reads server secrets from `process.env`. It must never be imported by a
 * browser/client (`"use client"`) module — guarded by a test.
 */

/** Env var NAMES this slice reads. Values are never required for tests/typecheck/build. */
export const HERMES_AGENT_ENV = {
  enabled: "HERMES_AGENT_ENABLED",
  gatewayUrl: "CHAINREACT_AI_GATEWAY_URL",
  gatewayToken: "CHAINREACT_AI_GATEWAY_TOKEN",
  timeoutMs: "HERMES_AGENT_TIMEOUT_MS",
} as const;

/** Rollout flag gating the Hermes Agent gateway path. DEFAULT OFF. */
export const HERMES_AGENT_ENABLED_FLAG = HERMES_AGENT_ENV.enabled;

/** Required to actually call the gateway (else `getHermesAgentGatewayConfig` returns null). */
export const HERMES_AGENT_REQUIRED_VARS = [
  HERMES_AGENT_ENV.gatewayUrl,
  HERMES_AGENT_ENV.gatewayToken,
] as const;

export interface HermesAgentGatewayConfig {
  /** Public Render gateway base URL, e.g. https://chainreact-ai-gateway-prod.onrender.com */
  readonly gatewayUrl: string;
  /** Server-only secret. Sent as `Authorization: Bearer`; never logged / never in a body or status. */
  readonly gatewayToken: string;
  readonly timeoutMs: number;
}

/**
 * REACT-AGENT-PRODUCTION-TIMEOUT-1 — the per-request gateway budget.
 *
 * The client aborts the gateway call at this deadline; the route then answers 503. It must stay
 * strictly INSIDE the serverless function budget (`export const maxDuration = 60` on both guidance
 * routes) so a slow brain produces OUR typed, safe JSON failure instead of a platform
 * `FUNCTION_INVOCATION_TIMEOUT` (504, no body, unusable in the UI).
 *
 * Why 45s and not the original 30s: a builder EDIT turn sends a much larger prompt than a first
 * "what should I build" turn — the 512-key capability catalog (~14 KB) plus the narrowed field
 * schemas (~17 KB) plus the editable graph, measured at ~45 KB / ~11k tokens versus ~25 KB / ~6k for
 * a new-workflow turn. The Hermes Agent's reasoning model routinely needs more than 30s for that,
 * which made every complex second turn fail at exactly the 30s mark. 45s leaves ~15s of the 60s
 * function budget for the route's own DB reads and the post-model option-resolver pass.
 *
 * `MAX_TIMEOUT_MS` is likewise capped below the function budget: an operator raising
 * `HERMES_AGENT_TIMEOUT_MS` past it would only trade a typed 503 for an untyped 504. Raising the
 * ceiling requires raising `maxDuration` on both routes first (guarded by a structure test).
 */
export const DEFAULT_TIMEOUT_MS = 45_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 55_000;

/** Serverless budget the guidance routes declare. Documented here; the routes need a literal. */
export const GUIDANCE_ROUTE_MAX_DURATION_SECONDS = 60;

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Read at call time (not module load) so tests/rollout can toggle without re-import. DEFAULT OFF. */
export function isHermesAgentEnabled(): boolean {
  return process.env[HERMES_AGENT_ENV.enabled] === "true";
}

/**
 * Build the gateway config from env, or `null` if disabled OR any required var is missing.
 * Never throws; never logs the token.
 */
export function getHermesAgentGatewayConfig(): HermesAgentGatewayConfig | null {
  if (!isHermesAgentEnabled()) return null;
  const gatewayUrl = process.env[HERMES_AGENT_ENV.gatewayUrl]?.trim();
  const gatewayToken = process.env[HERMES_AGENT_ENV.gatewayToken]?.trim();
  if (!gatewayUrl || !gatewayToken) return null;
  const timeoutMs = num(process.env[HERMES_AGENT_ENV.timeoutMs], DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  return { gatewayUrl, gatewayToken, timeoutMs };
}

/** SAFE status — flag + presence + missing var NAMES only. NEVER includes the token value. */
export interface HermesAgentConfigStatus {
  readonly enabled: boolean;
  readonly configured: boolean;
  /** Names (not values) of required vars that are unset. */
  readonly missing: readonly string[];
}

export function describeHermesAgentConfigStatus(): HermesAgentConfigStatus {
  const enabled = isHermesAgentEnabled();
  const missing = HERMES_AGENT_REQUIRED_VARS.filter((v) => !process.env[v]?.trim());
  return { enabled, configured: enabled && missing.length === 0, missing };
}
