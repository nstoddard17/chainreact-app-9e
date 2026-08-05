import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { McpRateLimitCounts } from "@/core/mcp/rateLimitPolicy";
import type { RpcArgs, RpcRows } from "@/types/rpc";
import { mcpRateLimitRowSchema, parseRpcResult } from "@/core/database/rpcResultSchemas";

/**
 * Durable rate-limit counter repository for the public MCP server
 * (Slice 4.PUBLIC-MCP-3).
 *
 * Service-role only — `mcp_rate_limits` is a system table the Data API cannot reach
 * (deny-all RLS + no authenticated GRANT). The single atomic increment RPC
 * (`increment_mcp_rate_limits`) bumps the per-token and per-account window buckets
 * in one transaction and returns the post-increment counts; the caller
 * (services/mcp/rateLimit.ts) compares them to the centralized limits. Bucket keys
 * are derived from ids only — no raw token material.
 */

export interface IncrementMcpRateLimitInput {
  tokenBucket: string;
  accountBucket: string;
  /** ISO-8601 aligned window start. */
  windowStart: string;
  /** ISO-8601 window end (window_start + window size). */
  expiresAt: string;
}

interface IncrementRow {
  token_count: number;
  account_count: number;
}

/**
 * Atomically increment both window buckets and return their post-increment counts.
 * Cross-instance safe (the RPC serializes same-bucket writers via the UPSERT row
 * lock).
 */
export async function incrementMcpRateLimitWindowsServiceRole(
  input: IncrementMcpRateLimitInput,
): Promise<McpRateLimitCounts> {
  const supabase = getServiceRoleClient("mcp_rate_limits: increment");
  const { data, error } = await supabase.rpc("increment_mcp_rate_limits", {
    p_token_bucket: input.tokenBucket,
    p_account_bucket: input.accountBucket,
    p_window_start: input.windowStart,
    p_expires_at: input.expiresAt,
  } satisfies RpcArgs<"increment_mcp_rate_limits">);
  if (error) {
    throw new Error(
      `mcp_rate_limits.incrementMcpRateLimitWindowsServiceRole failed: ${error.message}`,
    );
  }
  // PostgREST returns an array for a TABLE-returning function; a single
  // object is tolerated too (pinned by the repository unit tests).
  const rows: RpcRows<"increment_mcp_rate_limits"> = Array.isArray(data) ? data : data ? [data] : [];
  const first = rows[0];
  const row = first
    ? parseRpcResult("increment_mcp_rate_limits", mcpRateLimitRowSchema, first)
    : undefined;
  if (!row) {
    throw new Error(
      "mcp_rate_limits.incrementMcpRateLimitWindowsServiceRole failed: no row returned",
    );
  }
  return { token: row.token_count, account: row.account_count };
}
