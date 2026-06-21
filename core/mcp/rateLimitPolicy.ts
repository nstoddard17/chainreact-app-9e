/**
 * Public MCP request rate-limit POLICY (Slice 4.PUBLIC-MCP-3).
 *
 * Pure data + math — no DB, no I/O (core/ may only import contracts/). Owns the
 * tunable limit constants, the fixed-window alignment, the bucket-key derivation,
 * and the allow/deny decision. Durable counter storage lives in
 * repositories/mcpRateLimits.ts; orchestration in services/mcp/rateLimit.ts.
 *
 * Two dimensions (the MCP surface has no per-workflow axis):
 *   - per TOKEN   — the tightest bound; one client/token.
 *   - per ACCOUNT — the ceiling across all of an account's MCP tokens.
 *
 * SECURITY: bucket keys are derived from the token id / account id — NEVER from the
 * raw token or its hash.
 */

/** Fixed-window size (seconds). Both dimensions share one per-minute window. */
export const MCP_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Launch limits — requests allowed per window, per dimension. Reads are cheap and
 * an LLM client can be chatty, so these are more generous than the workflow-trigger
 * limits, while still bounding abuse of a public surface.
 */
export const MCP_RATE_LIMITS = {
  perToken: 120,
  perAccount: 600,
} as const;

export type McpRateLimits = typeof MCP_RATE_LIMITS;

export interface McpRateLimitCounts {
  token: number;
  account: number;
}

export interface McpRateLimitBucketKeys {
  token: string;
  account: string;
}

/** Floor a timestamp to the start of its fixed window (epoch-aligned). */
export function alignMcpWindowStartMs(
  nowMs: number,
  windowSeconds: number = MCP_RATE_LIMIT_WINDOW_SECONDS,
): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Derive the two bucket keys for a request. Uses stable identifiers only — the raw
 * token is never an input (the caller passes the token's id). Including
 * `windowStartMs` in the key makes each window a distinct row, so a window "resets"
 * naturally by moving to a new key. Distinct prefixes (`mcp:tok:` / `mcp:acct:`)
 * guarantee the two keys never collide within one call.
 */
export function buildMcpRateLimitBucketKeys(input: {
  tokenId: string;
  accountId: string;
  windowStartMs: number;
}): McpRateLimitBucketKeys {
  const w = input.windowStartMs;
  return {
    token: `mcp:tok:${input.tokenId}:${w}`,
    account: `mcp:acct:${input.accountId}:${w}`,
  };
}

export interface McpRateLimitDecision {
  allowed: boolean;
  /** Present only when denied; always a positive integer number of seconds. */
  retryAfterSeconds?: number;
}

/**
 * Decide allow/deny from the post-increment counts. Denied when EITHER dimension
 * exceeds its limit. `retryAfterSeconds` is the (positive) time until the current
 * window ends — when the counters reset.
 */
export function evaluateMcpRateLimit(input: {
  counts: McpRateLimitCounts;
  nowMs: number;
  windowStartMs: number;
  windowSeconds?: number;
  limits?: McpRateLimits;
}): McpRateLimitDecision {
  const limits = input.limits ?? MCP_RATE_LIMITS;
  const windowSeconds = input.windowSeconds ?? MCP_RATE_LIMIT_WINDOW_SECONDS;

  const exceeded =
    input.counts.token > limits.perToken || input.counts.account > limits.perAccount;

  if (!exceeded) return { allowed: true };

  const windowEndMs = input.windowStartMs + windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - input.nowMs) / 1000));
  return { allowed: false, retryAfterSeconds };
}
