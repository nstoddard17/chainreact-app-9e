import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { runReport as runReportApi } from "@/integrations/_shared/google/api/analytics/runReport";
import { resolveDateRange, normalizeReportRows } from "./_dateRange";
import { RunReportConfigSchema } from "./runReport.schema";

/**
 * Google Analytics `run_report` action handler — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Pure read (GA4 Data API `runReport`). Resolves the date-range preset,
 * runs the report, normalizes rows into `[{dimension:value, metric:number}]`.
 * `accountId` (UI-scope) is ignored — only `propertyId` is sent to GA.
 *
 * Output (camelCase; report rows marked sensitive at the meta layer):
 *   `{ rows, rowCount, dimensionHeaders, metricHeaders, totals, dateRange,
 *      metrics, dimensions }`.
 */
export const runReport: ActionHandler = async (input) => {
  const config = RunReportConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-analytics"
      ? input.triggerEvent.providerAccountId
      : null;

  const dateRange = resolveDateRange(
    config.dateRange,
    config.startDate,
    config.endDate,
  );

  const report = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-analytics",
    providerAccountId,
    apiCall: (accessToken) =>
      runReportApi({
        accessToken,
        propertyId: config.propertyId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: config.metrics,
        ...(config.dimensions !== undefined && { dimensions: config.dimensions }),
        ...(config.limit !== undefined && { limit: config.limit }),
      }),
  });

  const rows = normalizeReportRows(report);

  return {
    output: {
      rows,
      rowCount: typeof report.rowCount === "number" ? report.rowCount : rows.length,
      dimensionHeaders: (report.dimensionHeaders ?? []).map((h) => h.name ?? null),
      metricHeaders: (report.metricHeaders ?? []).map((h) => h.name ?? null),
      totals: report.totals ?? [],
      dateRange,
      metrics: config.metrics,
      dimensions: config.dimensions ?? [],
    },
  };
};
