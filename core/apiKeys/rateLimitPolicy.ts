/**
 * Public API-key trigger rate-limit POLICY (Slice 4.API-KEYS-RATE-LIMIT-1).
 *
 * Pure data + math — no DB, no I/O (core/ may only import contracts/). Owns the
 * tunable limit constants, the fixed-window alignment, the bucket-key derivation,
 * and the allow/deny decision. The durable counter storage lives in
 * repositories/apiKeyRateLimits.ts; the orchestration in services/apiKeys/rateLimit.ts.
 *
 * SECURITY: bucket keys are derived from the key id / account id / workflow id —
 * NEVER from the raw API key or its hash.
 */

/** Fixed-window size (seconds). All three dimensions share one per-minute window. */
export const API_KEY_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Launch limits — triggers allowed per window, per dimension. Centralized + easy to
 * tune. The most specific dimension (per-workflow) is the tightest; per-account is
 * the broadest ceiling across all of an account's keys/workflows.
 */
export const API_KEY_RATE_LIMITS = {
  perKey: 60,
  perWorkflow: 30,
  perAccount: 300,
} as const;

export type ApiKeyRateLimits = typeof API_KEY_RATE_LIMITS;

export interface RateLimitCounts {
  key: number;
  workflow: number;
  account: number;
}

export interface RateLimitBucketKeys {
  key: string;
  workflow: string;
  account: string;
}

/** Floor a timestamp to the start of its fixed window (epoch-aligned). */
export function alignWindowStartMs(
  nowMs: number,
  windowSeconds: number = API_KEY_RATE_LIMIT_WINDOW_SECONDS,
): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Derive the three bucket keys for a request. Uses stable identifiers only — the
 * raw key is never an input here (the caller passes the key's id). Including
 * `windowStartMs` in the key makes each window a distinct row, so a window "resets"
 * naturally by moving to a new key.
 */
export function buildRateLimitBucketKeys(input: {
  keyId: string;
  accountId: string;
  workflowId: string;
  windowStartMs: number;
}): RateLimitBucketKeys {
  const w = input.windowStartMs;
  return {
    key: `key:${input.keyId}:${w}`,
    workflow: `wf:${input.accountId}:${input.workflowId}:${w}`,
    account: `acct:${input.accountId}:${w}`,
  };
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Present only when denied; always a positive integer number of seconds. */
  retryAfterSeconds?: number;
}

/**
 * Decide allow/deny from the post-increment counts. Denied when ANY dimension
 * exceeds its limit. `retryAfterSeconds` is the (positive) time until the current
 * window ends — when the counters reset.
 */
export function evaluateRateLimit(input: {
  counts: RateLimitCounts;
  nowMs: number;
  windowStartMs: number;
  windowSeconds?: number;
  limits?: ApiKeyRateLimits;
}): RateLimitDecision {
  const limits = input.limits ?? API_KEY_RATE_LIMITS;
  const windowSeconds = input.windowSeconds ?? API_KEY_RATE_LIMIT_WINDOW_SECONDS;

  const exceeded =
    input.counts.key > limits.perKey ||
    input.counts.workflow > limits.perWorkflow ||
    input.counts.account > limits.perAccount;

  if (!exceeded) return { allowed: true };

  const windowEndMs = input.windowStartMs + windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - input.nowMs) / 1000));
  return { allowed: false, retryAfterSeconds };
}
