import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { RateLimitCounts } from "@/core/apiKeys/rateLimitPolicy";
import type { RpcArgs, RpcRows } from "@/types/rpc";
import { apiKeyRateLimitRowSchema, parseRpcResult } from "@/core/database/rpcResultSchemas";

/**
 * Durable rate-limit counter repository (Slice 4.API-KEYS-RATE-LIMIT-1).
 *
 * Service-role only — `api_key_rate_limits` is a system table the Data API cannot
 * reach (deny-all RLS + no authenticated GRANT). The single atomic increment RPC
 * (`increment_api_key_rate_limits`) bumps the per-key, per-workflow, and
 * per-account window buckets in one transaction and returns the post-increment
 * counts; the caller (services/apiKeys/rateLimit.ts) compares them to the
 * centralized limits. Bucket keys are derived from ids only — no raw key material.
 */

export interface IncrementRateLimitInput {
  keyBucket: string;
  workflowBucket: string;
  accountBucket: string;
  /** ISO-8601 aligned window start. */
  windowStart: string;
  /** ISO-8601 window end (window_start + window size). */
  expiresAt: string;
}

interface IncrementRow {
  key_count: number;
  workflow_count: number;
  account_count: number;
}

/**
 * Atomically increment all three window buckets and return their post-increment
 * counts. Cross-instance safe (the RPC serializes same-bucket writers via the
 * UPSERT row lock).
 */
export async function incrementApiKeyRateLimitWindowsServiceRole(
  input: IncrementRateLimitInput,
): Promise<RateLimitCounts> {
  const supabase = getServiceRoleClient("api_key_rate_limits: increment");
  const { data, error } = await supabase.rpc("increment_api_key_rate_limits", {
    p_key_bucket: input.keyBucket,
    p_workflow_bucket: input.workflowBucket,
    p_account_bucket: input.accountBucket,
    p_window_start: input.windowStart,
    p_expires_at: input.expiresAt,
  } satisfies RpcArgs<"increment_api_key_rate_limits">);
  if (error) {
    throw new Error(
      `api_key_rate_limits.incrementApiKeyRateLimitWindowsServiceRole failed: ${error.message}`,
    );
  }
  // A TABLE-returning function comes back as an array of rows.
  // PostgREST returns an array for a TABLE-returning function; a single
  // object is tolerated too (pinned by the repository unit tests).
  const rows: RpcRows<"increment_api_key_rate_limits"> = Array.isArray(data) ? data : data ? [data] : [];
  const first = rows[0];
  const row = first
    ? parseRpcResult("increment_api_key_rate_limits", apiKeyRateLimitRowSchema, first)
    : undefined;
  if (!row) {
    throw new Error(
      "api_key_rate_limits.incrementApiKeyRateLimitWindowsServiceRole failed: no row returned",
    );
  }
  return {
    key: row.key_count,
    workflow: row.workflow_count,
    account: row.account_count,
  };
}
