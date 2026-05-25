import { dataApiPost, type AnalyticsReportResponse } from "./_dataRequest";

/**
 * Wrapper for GA4 Data API `properties.runRealtimeReport` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: POST {dataBase}/v1beta/properties/{propertyId}:runRealtimeReport
 * Body: `{ metrics, dimensions?, limit? }` — NO `dateRanges` (realtime is the
 * last ~30 minutes). Returns the GA4 report shape (headers + rows).
 *
 * Promotes the V1 orphan `getGoogleAnalyticsRealtimeData` handler. Caller
 * normalizes; auth wraps via refreshAndRetry.
 */
export interface RunRealtimeReportInput {
  accessToken: string;
  propertyId: string;
  metrics: readonly string[];
  dimensions?: readonly string[];
  limit?: number;
}

export async function runRealtimeReport(
  input: RunRealtimeReportInput,
): Promise<AnalyticsReportResponse> {
  const body: Record<string, unknown> = {
    metrics: input.metrics.map((name) => ({ name })),
  };
  if (input.dimensions && input.dimensions.length > 0) {
    body.dimensions = input.dimensions.map((name) => ({ name }));
  }
  if (typeof input.limit === "number") body.limit = input.limit;

  return dataApiPost<AnalyticsReportResponse>({
    accessToken: input.accessToken,
    propertyId: input.propertyId,
    method: "runRealtimeReport",
    body,
  });
}
