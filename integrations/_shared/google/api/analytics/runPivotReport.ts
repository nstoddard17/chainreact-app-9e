import { dataApiPost, type AnalyticsReportResponse } from "./_dataRequest";

/**
 * Wrapper for GA4 Data API `properties.runPivotReport` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: POST {dataBase}/v1beta/properties/{propertyId}:runPivotReport
 * Body: `{ dateRanges, metrics, dimensions, pivots[] }` — `pivots[]` carries
 * the column dimensions (`fieldNames`) + per-pivot `limit`. GA4 requires
 * every pivot `fieldName` to also appear in the top-level `dimensions`, so
 * the wrapper unions row + pivot dimensions into `dimensions`.
 *
 * Returns the GA4 pivot response (pivotHeaders + rows + aggregates). Caller
 * normalizes; auth wraps via refreshAndRetry.
 */
export interface RunPivotReportInput {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  metrics: readonly string[];
  /** Row dimensions. */
  dimensions?: readonly string[];
  /** Column (pivot) dimensions. */
  pivotDimensions?: readonly string[];
  limit?: number;
}

export interface AnalyticsPivotReportResponse extends AnalyticsReportResponse {
  pivotHeaders?: Array<{
    pivotDimensionHeaders?: Array<{
      dimensionValues?: Array<{ value?: string }>;
    }>;
    rowCount?: number;
  }>;
}

export async function runPivotReport(
  input: RunPivotReportInput,
): Promise<AnalyticsPivotReportResponse> {
  const rowDims = input.dimensions ?? [];
  const pivotDims = input.pivotDimensions ?? [];
  // GA4 requires every pivot fieldName to also be declared in `dimensions`.
  const allDims = Array.from(new Set([...rowDims, ...pivotDims]));

  const pivots: Array<Record<string, unknown>> = [];
  if (rowDims.length > 0) {
    pivots.push({
      fieldNames: rowDims,
      limit: input.limit ?? 100,
    });
  }
  if (pivotDims.length > 0) {
    pivots.push({
      fieldNames: pivotDims,
      limit: input.limit ?? 100,
    });
  }

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    metrics: input.metrics.map((name) => ({ name })),
    dimensions: allDims.map((name) => ({ name })),
    pivots,
  };

  return dataApiPost<AnalyticsPivotReportResponse>({
    accessToken: input.accessToken,
    propertyId: input.propertyId,
    method: "runPivotReport",
    body,
  });
}
