import {
  buildInsightsRateBuckets,
  isInsightsRateAllowed,
} from "@/core/analytics/insightsRateLimitPolicy";
import * as providerRateLimitsRepo from "@/repositories/analytics/providerRateLimits";

/**
 * Protective limiter seam for COLD connected-analytics provider executions
 * (CD-2). Consumed ONLY by the coalescing leader of a cache-miss query —
 * cache hits and followers never reach this. Cross-instance via Postgres;
 * fail-open is NOT allowed (a limiter outage blocks cold provider work rather
 * than allowing an unmetered storm — stale cache still serves).
 */
export interface InsightsRateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumeInsightsProviderBudget(input: {
  accountId: string;
  sourceId: string;
  sourceUserId: string | null;
  now?: number;
}): Promise<InsightsRateDecision> {
  const buckets = buildInsightsRateBuckets({
    accountId: input.accountId,
    sourceId: input.sourceId,
    sourceUserId: input.sourceUserId,
    nowMs: input.now ?? Date.now(),
  });
  const counts = await providerRateLimitsRepo.incrementProviderRateBuckets(buckets);
  return {
    allowed: isInsightsRateAllowed(counts),
    retryAfterSeconds: buckets.retryAfterSeconds,
  };
}
