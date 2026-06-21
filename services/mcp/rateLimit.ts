import {
  alignMcpWindowStartMs,
  buildMcpRateLimitBucketKeys,
  evaluateMcpRateLimit,
  MCP_RATE_LIMIT_WINDOW_SECONDS,
} from "@/core/mcp/rateLimitPolicy";
import { incrementMcpRateLimitWindowsServiceRole } from "@/repositories/mcpRateLimits";

/**
 * Public MCP request rate limiter (Slice 4.PUBLIC-MCP-3).
 *
 * Durable, cross-instance, Postgres-backed fixed-window limiter. Enforces two
 * dimensions (per token / per account) in one atomic RPC, then maps the
 * post-increment counts to an allow/deny decision via the centralized policy.
 *
 * Called by the public MCP route AFTER token verification + membership re-check
 * pass — but BEFORE any tool dispatch — so a denied request never reads data, never
 * updates `last_used_at`, and gets a 429 + `Retry-After`.
 *
 * No raw token material reaches the limiter: bucket keys are derived from the token
 * id / account id only.
 */

export interface McpRateLimitInput {
  tokenId: string;
  accountId: string;
}

export interface McpRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export async function rateLimitMcpRequest(
  input: McpRateLimitInput,
): Promise<McpRateLimitResult> {
  const nowMs = Date.now();
  const windowStartMs = alignMcpWindowStartMs(nowMs);
  const windowExpiresMs = windowStartMs + MCP_RATE_LIMIT_WINDOW_SECONDS * 1000;

  const buckets = buildMcpRateLimitBucketKeys({
    tokenId: input.tokenId,
    accountId: input.accountId,
    windowStartMs,
  });

  const counts = await incrementMcpRateLimitWindowsServiceRole({
    tokenBucket: buckets.token,
    accountBucket: buckets.account,
    windowStart: new Date(windowStartMs).toISOString(),
    expiresAt: new Date(windowExpiresMs).toISOString(),
  });

  return evaluateMcpRateLimit({ counts, nowMs, windowStartMs });
}
