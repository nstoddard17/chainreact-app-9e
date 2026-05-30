import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { runPivotReport as runPivotReportApi } from "@/integrations/_shared/google/api/analytics/runPivotReport";
import { resolveDateRange, normalizeReportRows } from "./_dateRange";
import { RunPivotReportConfigSchema } from "./runPivotReport.schema";

/**
 * Google Analytics `run_pivot_report` action handler — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Pure read (GA4 Data API `runPivotReport`). Resolves the date range, runs
 * the pivot, normalizes rows, surfaces pivot column headers. `accountId`
 * (UI-scope) is ignored.
 *
 * Output: `{ rows, rowCount, columnHeaders, dateRange, metrics, dimensions,
 *            pivotDimensions }`.
 */
export const runPivotReport: ActionHandler = async (input) => {
  const config = RunPivotReportConfigSchema.parse(input.config);

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
      runPivotReportApi({
        accessToken,
        propertyId: config.propertyId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: config.metrics,
        ...(config.dimensions !== undefined && { dimensions: config.dimensions }),
        ...(config.pivotDimensions !== undefined && {
          pivotDimensions: config.pivotDimensions,
        }),
        ...(config.limit !== undefined && { limit: config.limit }),
      }),
  });

  const rows = normalizeReportRows(report);

  // Flatten pivot column-header values from the GA4 pivotHeaders shape.
  const columnHeaders: string[] = [];
  for (const ph of report.pivotHeaders ?? []) {
    for (const dh of ph.pivotDimensionHeaders ?? []) {
      for (const dv of dh.dimensionValues ?? []) {
        if (typeof dv.value === "string") columnHeaders.push(dv.value);
      }
    }
  }

  return {
    output: {
      rows,
      rowCount: typeof report.rowCount === "number" ? report.rowCount : rows.length,
      columnHeaders,
      dateRange,
      metrics: config.metrics,
      dimensions: config.dimensions ?? [],
      pivotDimensions: config.pivotDimensions ?? [],
    },
  };
};
