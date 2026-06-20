import { runReport } from "@/integrations/_shared/google/api/analytics/runReport";
import { parseGaDate, parseMetricValue } from "./buckets";

/**
 * Bounded, READ-ONLY, AGGREGATE-ONLY GA4 Data API reader for the analytics source
 * (Slice ANALYTICS-SOURCES-GA-1). Reuses the already-shipped, sanitized
 * `runReport` wrapper (`integrations/_shared/google/api/analytics/runReport.ts`)
 * rather than re-implementing the Data API transport — that wrapper already maps
 * 401 → Unauthorized401Error (→ refreshAndRetry), 404 → AnalyticsNotFoundError,
 * 429 / RESOURCE_EXHAUSTED → AnalyticsQuotaError, and strips GA error bodies to a
 * sanitized `error.status` tag.
 *
 * SAFETY: the `metric` passed in is ALWAYS one the adapter resolved from its
 * server-side allow-list (`index.ts`) — never a string from widget config. The
 * ONLY dimension this reader ever requests is `date` (for over-time series). It
 * never requests a user/client-id, page-path, URL, search-term, source/medium, or
 * geo/device dimension, and never returns a raw GA report payload — only parsed
 * numeric scalars / `{ dateMs, value }` points.
 */

/** ≤ 500 daily `date` rows per series report (covers > 1 year before truncation). */
export const SERIES_ROW_LIMIT = 500;

export interface GaSeriesPoint {
  /** UTC-midnight epoch ms of the GA `date` row (null rows are dropped upstream). */
  dateMs: number;
  /** Parsed (rounded) metric value for that day. */
  value: number;
}

export interface GaSeriesResult {
  points: GaSeriesPoint[];
  /** True when GA reported more matching rows than the row budget fetched. */
  truncated: boolean;
}

/**
 * Single aggregate scalar for one approved GA metric over [startDate, endDate]
 * (no dimension → GA returns the one range total). Missing rows → 0.
 */
export async function gaScalar(input: {
  accessToken: string;
  propertyId: string;
  metric: string;
  startDate: string;
  endDate: string;
}): Promise<number> {
  const report = await runReport({
    accessToken: input.accessToken,
    propertyId: input.propertyId,
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: [input.metric],
  });
  const row = report.rows?.[0] ?? report.totals?.[0];
  return parseMetricValue(row?.metricValues?.[0]?.value);
}

/**
 * Daily series for one approved GA metric, dimension `date` only, bounded by
 * {@link SERIES_ROW_LIMIT}. Each row → `{ dateMs, value }`; unparseable / `(other)`
 * date rows are dropped. `truncated` is set when GA's `rowCount` exceeds the rows
 * fetched (or the budget was hit).
 */
export async function gaSeries(input: {
  accessToken: string;
  propertyId: string;
  metric: string;
  startDate: string;
  endDate: string;
}): Promise<GaSeriesResult> {
  const report = await runReport({
    accessToken: input.accessToken,
    propertyId: input.propertyId,
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: [input.metric],
    dimensions: ["date"],
    limit: SERIES_ROW_LIMIT,
  });

  const rows = report.rows ?? [];
  const points: GaSeriesPoint[] = [];
  for (const row of rows) {
    const dateMs = parseGaDate(row.dimensionValues?.[0]?.value);
    if (dateMs === null) continue;
    points.push({ dateMs, value: parseMetricValue(row.metricValues?.[0]?.value) });
  }

  const totalRows = typeof report.rowCount === "number" ? report.rowCount : rows.length;
  const truncated = totalRows > rows.length || rows.length >= SERIES_ROW_LIMIT;
  return { points, truncated };
}
