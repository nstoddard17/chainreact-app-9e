import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import {
  getInsightDataset,
  getInsightSource,
  type AnalyticsExecutionContext,
} from "./registry";
import { validateConnectedQuery } from "./validateQuery";
import { buildInsightsCacheKey, queryInsightsWithCache } from "./cache";
import { coalesceInflight } from "./coalesce";
import { consumeInsightsProviderBudget } from "./rateLimit";

/**
 * Connected-analytics orchestrator (CD-1; CD-2 added the provider pipeline):
 * resolve catalog → validate capabilities → execute.
 *
 * PROVIDER-BACKED datasets (`freshness.mode: "cached"`) run the full CD-2
 * pipeline — snapshot-cache first; identical cold requests COALESCE
 * per-process onto one leader; only that leader consumes the durable
 * per-account/per-source PROTECTIVE limiter budget before the adapter
 * executes. Cache hits and followers never consume budget. The cache/
 * coalescing key is the same isolation-safe identity (account + personal
 * source-user + source + dataset + full normalized query) — cross-account or
 * cross-user sharing is impossible by construction. Live/internal datasets
 * (ChainReact) bypass cache/limiter and hit their adapter directly.
 */
export async function runConnectedAnalyticsQuery(
  ctx: AnalyticsExecutionContext,
  query: ConnectedAnalyticsQuery,
  opts: { refresh?: boolean } = {},
): Promise<ConnectedAnalyticsResult> {
  if (!getInsightSource(query.source)) {
    throw new ConnectedAnalyticsError("That data source isn't available.", "UNKNOWN_SOURCE");
  }
  const reg = getInsightDataset(query.source, query.dataset);
  if (!reg) {
    throw new ConnectedAnalyticsError("That data isn't available.", "UNKNOWN_DATASET");
  }
  validateConnectedQuery(reg, query);

  const { dataset, catalog } = reg;
  if (dataset.freshness.mode !== "cached") {
    return reg.adapter.query(ctx, query);
  }

  const sourceUserId =
    catalog.source.credentialMode === "personal" ? ctx.userId : null;
  const identity = {
    accountId: ctx.accountId,
    sourceUserId,
    sourceId: catalog.source.id,
    datasetId: dataset.id,
    query,
  };
  const key = buildInsightsCacheKey(identity);

  const { result } = await coalesceInflight(key, () =>
    queryInsightsWithCache(
      identity,
      dataset.freshness.ttlSeconds,
      async () => {
        const decision = await consumeInsightsProviderBudget({
          accountId: ctx.accountId,
          sourceId: catalog.source.id,
          sourceUserId,
          ...(ctx.now !== undefined ? { now: ctx.now } : {}),
        });
        if (!decision.allowed) {
          throw new ConnectedAnalyticsError(
            "This data has been refreshed several times recently. Try again shortly.",
            "RATE_LIMITED",
            { retryAfterSeconds: decision.retryAfterSeconds },
          );
        }
        return reg.adapter.query(ctx, query);
      },
      { ...(opts.refresh !== undefined ? { refresh: opts.refresh } : {}), ...(ctx.now !== undefined ? { now: ctx.now } : {}) },
    ),
  );
  return result;
}
