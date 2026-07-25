/**
 * Connected-analytics protective rate-limit POLICY (CD-2). Pure — numbers,
 * window math, and bucket-key derivation only (mirrors core/mcp/rateLimitPolicy).
 *
 * COST MODEL (documented decision, audit §12/§13): the limiter counts LOGICAL
 * COLD ANALYTICS QUERIES — one unit when a cache-miss leader is about to
 * execute a provider adapter. Cache hits and coalesced followers are free.
 * A single cold Stripe query costs ≤ MAX_PAGES (20) provider GETs, so the
 * per-source cap below bounds worst-case provider calls per account-minute
 * (10 × 20 = 200 Stripe requests/min) without tracking per-page cost — the
 * smallest robust model. Buckets embed derived ids only (account, source,
 * optional user for personal-credential sources) — never tokens/credentials.
 */

export const INSIGHTS_RATE_WINDOW_MS = 60_000;
/** Cold provider queries per account per window, across ALL sources. */
export const INSIGHTS_ACCOUNT_LIMIT_PER_WINDOW = 30;
/** Cold provider queries per account per source per window. */
export const INSIGHTS_SOURCE_LIMIT_PER_WINDOW = 10;

export interface InsightsRateBuckets {
  accountBucket: string;
  sourceBucket: string;
  windowStartMs: number;
  expiresAtMs: number;
  /** Seconds until the current window rolls over (retry hint). */
  retryAfterSeconds: number;
}

export function buildInsightsRateBuckets(input: {
  accountId: string;
  sourceId: string;
  /** Set ONLY for personal-credential sources — isolates each member's budget. */
  sourceUserId: string | null;
  nowMs: number;
}): InsightsRateBuckets {
  const windowStartMs =
    Math.floor(input.nowMs / INSIGHTS_RATE_WINDOW_MS) * INSIGHTS_RATE_WINDOW_MS;
  const expiresAtMs = windowStartMs + INSIGHTS_RATE_WINDOW_MS;
  const userSeg = input.sourceUserId ? `:u:${input.sourceUserId}` : "";
  return {
    accountBucket: `apl:acct:${input.accountId}:${windowStartMs}`,
    sourceBucket: `apl:src:${input.accountId}:${input.sourceId}${userSeg}:${windowStartMs}`,
    windowStartMs,
    expiresAtMs,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAtMs - input.nowMs) / 1000)),
  };
}

export function isInsightsRateAllowed(counts: {
  accountCount: number;
  sourceCount: number;
}): boolean {
  return (
    counts.accountCount <= INSIGHTS_ACCOUNT_LIMIT_PER_WINDOW &&
    counts.sourceCount <= INSIGHTS_SOURCE_LIMIT_PER_WINDOW
  );
}
