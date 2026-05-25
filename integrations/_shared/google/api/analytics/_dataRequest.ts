import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { analyticsDataApiBase } from "./_base";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
  isQuotaStatus,
  surfaceAnalyticsErrorDetail,
} from "./errors";

/**
 * Shared GA4 Data API transport — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * The three report wrappers (runReport / runPivotReport / runRealtimeReport)
 * are the same POST to `properties/{id}:{method}` with the same status
 * mapping, so the transport is factored here (DRY) rather than inlined three
 * times.
 *
 * Status mapping:
 *   - 401 → `Unauthorized401Error` (drives refreshAndRetry).
 *   - 404 → `AnalyticsNotFoundError` (bad property).
 *   - 429 / RESOURCE_EXHAUSTED → `AnalyticsQuotaError` (no backoff — D-GA5).
 *   - other 4xx/5xx → `AnalyticsApiError`.
 *
 * Errors carry ONLY the sanitized `error.status` tag — never the request
 * body (metrics/dimensions), the response body, report rows, or the token.
 */

/** GA4 dimension/metric header + row shapes (subset we read). */
export interface AnalyticsHeader {
  name?: string;
  type?: string;
}
export interface AnalyticsValue {
  value?: string;
}
export interface AnalyticsRow {
  dimensionValues?: AnalyticsValue[];
  metricValues?: AnalyticsValue[];
}
export interface AnalyticsReportResponse {
  dimensionHeaders?: AnalyticsHeader[];
  metricHeaders?: AnalyticsHeader[];
  rows?: AnalyticsRow[];
  totals?: AnalyticsRow[];
  rowCount?: number;
  [k: string]: unknown;
}

export async function dataApiPost<T>(input: {
  accessToken: string;
  propertyId: string;
  /** The `:method` segment — `runReport` / `runPivotReport` / `runRealtimeReport`. */
  method: "runReport" | "runPivotReport" | "runRealtimeReport";
  body: Record<string, unknown>;
}): Promise<T> {
  const url = `${analyticsDataApiBase()}/v1beta/properties/${encodeURIComponent(
    input.propertyId,
  )}:${input.method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Google Analytics ${input.method} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    throw new AnalyticsNotFoundError(`property ${input.propertyId}`);
  }
  if (!res.ok) {
    const text = await res.text();
    if (isQuotaStatus(text, res.status)) {
      throw new AnalyticsQuotaError(surfaceAnalyticsErrorDetail(text, res.status));
    }
    throw new AnalyticsApiError(
      surfaceAnalyticsErrorDetail(text, res.status),
      res.status,
    );
  }

  const text = await res.text();
  return (text.length === 0 ? {} : JSON.parse(text)) as T;
}
