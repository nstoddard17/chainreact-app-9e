import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { runRealtimeReport as runRealtimeReportApi } from "@/integrations/_shared/google/api/analytics/runRealtimeReport";
import { normalizeReportRows } from "./_dateRange";
import { GetRealtimeDataConfigSchema } from "./getRealtimeData.schema";

/**
 * Google Analytics `get_realtime_data` action handler — Slice
 * 3.GOOGLE-ANALYTICS-2 (promoted V1 orphan).
 *
 * Pure read (GA4 Data API `runRealtimeReport`). Normalizes rows and surfaces
 * the common realtime aggregates when their metrics were requested
 * (activeUsers / screenPageViews / eventCount). `accountId` (UI-scope)
 * ignored.
 *
 * Output: `{ activeUsers, pageViews, eventCount, rows, rowCount }`.
 */
export const getRealtimeData: ActionHandler = async (input) => {
  const config = GetRealtimeDataConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-analytics"
      ? input.triggerEvent.providerAccountId
      : null;

  const report = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-analytics",
    providerAccountId,
    apiCall: (accessToken) =>
      runRealtimeReportApi({
        accessToken,
        propertyId: config.propertyId,
        metrics: config.metrics,
        ...(config.dimensions !== undefined && { dimensions: config.dimensions }),
        ...(config.limit !== undefined && { limit: config.limit }),
      }),
  });

  const rows = normalizeReportRows(report);

  // Convenience aggregates from the FIRST row, keyed by metric name (mirrors
  // V1). null when the metric wasn't requested / present.
  const metricNames = (report.metricHeaders ?? []).map((h) => h.name ?? "");
  const firstRow = report.rows?.[0];
  const valueFor = (metric: string): number | null => {
    const idx = metricNames.indexOf(metric);
    if (idx < 0) return null;
    const raw = firstRow?.metricValues?.[idx]?.value;
    return raw === undefined ? null : Number.parseInt(raw, 10);
  };

  return {
    output: {
      activeUsers: valueFor("activeUsers"),
      pageViews: valueFor("screenPageViews"),
      eventCount: valueFor("eventCount"),
      rows,
      rowCount: rows.length,
    },
  };
};
