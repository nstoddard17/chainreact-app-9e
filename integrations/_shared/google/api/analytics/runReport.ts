import { dataApiPost, type AnalyticsReportResponse } from "./_dataRequest";

/**
 * Wrapper for GA4 Data API `properties.runReport` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: POST {dataBase}/v1beta/properties/{propertyId}:runReport
 * Body: `{ dateRanges, metrics, dimensions?, limit?, keepEmptyRows:false }`.
 * Returns: the GA4 report (dimension/metric headers + rows + totals).
 *
 * Caller (the `run_report` handler) normalizes rows into records; this
 * wrapper surfaces the raw GA4 shape. Auth wraps via refreshAndRetry.
 */
export interface RunReportInput {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  metrics: readonly string[];
  dimensions?: readonly string[];
  limit?: number;
}

export async function runReport(
  input: RunReportInput,
): Promise<AnalyticsReportResponse> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    metrics: input.metrics.map((name) => ({ name })),
    keepEmptyRows: false,
  };
  if (input.dimensions && input.dimensions.length > 0) {
    body.dimensions = input.dimensions.map((name) => ({ name }));
  }
  if (typeof input.limit === "number") body.limit = input.limit;

  return dataApiPost<AnalyticsReportResponse>({
    accessToken: input.accessToken,
    propertyId: input.propertyId,
    method: "runReport",
    body,
  });
}
