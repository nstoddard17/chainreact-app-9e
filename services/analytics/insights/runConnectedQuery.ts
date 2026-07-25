import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { getInsightDataset, getInsightSource, type AnalyticsExecutionContext } from "./registry";
import { validateConnectedQuery } from "./validateQuery";

/**
 * Connected-analytics orchestrator (CD-1): resolve catalog → validate
 * capabilities → dispatch the dataset adapter. The route owns auth; THIS
 * layer owns "is the question askable". Unknown source/dataset errors carry
 * generic copy only — no registry internals, no id echoes.
 */
export async function runConnectedAnalyticsQuery(
  ctx: AnalyticsExecutionContext,
  query: ConnectedAnalyticsQuery,
): Promise<ConnectedAnalyticsResult> {
  if (!getInsightSource(query.source)) {
    throw new ConnectedAnalyticsError("That data source isn't available.", "UNKNOWN_SOURCE");
  }
  const reg = getInsightDataset(query.source, query.dataset);
  if (!reg) {
    throw new ConnectedAnalyticsError("That data isn't available.", "UNKNOWN_DATASET");
  }
  validateConnectedQuery(reg, query);
  return reg.adapter.query(ctx, query);
}
