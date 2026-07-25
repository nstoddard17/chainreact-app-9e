import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * Repository for `analytics_provider_rate_limits` (CD-2, migration
 * 20260802000000) — the ONLY caller of
 * `increment_analytics_provider_rate_limits`. Service-role, system table;
 * bucket keys are derived ids (never tokens/credentials/payloads). Mirrors
 * repositories/mcpRateLimits.ts.
 */
export interface ProviderRateCounts {
  accountCount: number;
  sourceCount: number;
}

export async function incrementProviderRateBuckets(input: {
  accountBucket: string;
  sourceBucket: string;
  windowStartMs: number;
  expiresAtMs: number;
}): Promise<ProviderRateCounts> {
  const supabase = getServiceRoleClient("analytics: provider rate limit increment");
  const { data, error } = await supabase.rpc(
    "increment_analytics_provider_rate_limits",
    {
      p_account_bucket: input.accountBucket,
      p_source_bucket: input.sourceBucket,
      p_window_start: new Date(input.windowStartMs).toISOString(),
      p_expires_at: new Date(input.expiresAtMs).toISOString(),
    },
  );
  if (error) {
    throw new Error(`analytics_provider_rate_limits increment failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { account_count: number; source_count: number }
    | undefined;
  if (!row) throw new Error("analytics_provider_rate_limits increment returned no row");
  return { accountCount: Number(row.account_count), sourceCount: Number(row.source_count) };
}
