import {
  alignWindowStartMs,
  buildRateLimitBucketKeys,
  evaluateRateLimit,
  API_KEY_RATE_LIMIT_WINDOW_SECONDS,
} from "@/core/apiKeys/rateLimitPolicy";
import { incrementApiKeyRateLimitWindowsServiceRole } from "@/repositories/apiKeyRateLimits";

/**
 * Public API-key trigger rate limiter (Slice 4.API-KEYS-RATE-LIMIT-1).
 *
 * Durable, cross-instance, Postgres-backed fixed-window limiter — the production
 * replacement for the original permissive placeholder. Enforces three dimensions
 * (per key / per workflow / per account) in one atomic RPC, then maps the
 * post-increment counts to an allow/deny decision via the centralized policy.
 *
 * Called by the public trigger route AFTER key verification, scope, ownership, and
 * freeze checks pass — but BEFORE enqueue — so a denied request never enqueues a
 * run, never touches billing/task usage, and never updates `last_used_at`.
 *
 * No raw key material reaches the limiter: bucket keys are derived from the key id /
 * account id / workflow id only. Responses stay generic (the route maps a denial to
 * a 429 + `Retry-After`).
 */

export interface RateLimitInput {
  keyId: string;
  accountId: string;
  workflowId: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (only when `!allowed`). */
  retryAfterSeconds?: number;
}

export async function rateLimitApiKeyTrigger(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowStartMs = alignWindowStartMs(nowMs);
  const windowExpiresMs = windowStartMs + API_KEY_RATE_LIMIT_WINDOW_SECONDS * 1000;

  const buckets = buildRateLimitBucketKeys({
    keyId: input.keyId,
    accountId: input.accountId,
    workflowId: input.workflowId,
    windowStartMs,
  });

  const counts = await incrementApiKeyRateLimitWindowsServiceRole({
    keyBucket: buckets.key,
    workflowBucket: buckets.workflow,
    accountBucket: buckets.account,
    windowStart: new Date(windowStartMs).toISOString(),
    expiresAt: new Date(windowExpiresMs).toISOString(),
  });

  return evaluateRateLimit({ counts, nowMs, windowStartMs });
}
