import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { analyticsAdminApiBase } from "./_base";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
  isQuotaStatus,
  surfaceAnalyticsErrorDetail,
} from "./errors";

/**
 * Wrapper for GA4 Admin API `properties.conversionEvents.list` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: GET {adminBase}/v1beta/properties/{propertyId}/conversionEvents
 * Returns: `{ conversionEvents: [{ name, eventName, countingMethod, ... }] }`.
 *
 * Backs the `find_conversion` handler (find a conversion by event name).
 * Single bounded page (pageSize 200) — properties have few conversion
 * events. Auth wraps via refreshAndRetry. Errors sanitized.
 */
export interface ConversionEvent {
  /** Resource name: `properties/{id}/conversionEvents/{conversionEventId}`. */
  name?: string;
  eventName?: string;
  countingMethod?: string;
  createTime?: string;
  custom?: boolean;
  deletable?: boolean;
}

export interface ConversionEventsListResponse {
  conversionEvents?: ConversionEvent[];
  nextPageToken?: string;
}

export async function conversionEventsList(input: {
  accessToken: string;
  propertyId: string;
  pageSize?: number;
}): Promise<ConversionEventsListResponse> {
  const url = `${analyticsAdminApiBase()}/v1beta/properties/${encodeURIComponent(
    input.propertyId,
  )}/conversionEvents?pageSize=${input.pageSize ?? 200}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Analytics conversionEvents.list returned HTTP 401",
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
  return (text.length === 0 ? {} : JSON.parse(text)) as ConversionEventsListResponse;
}
