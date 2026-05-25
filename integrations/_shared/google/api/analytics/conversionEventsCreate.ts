import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { analyticsAdminApiBase } from "./_base";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
  isQuotaStatus,
  surfaceAnalyticsErrorDetail,
} from "./errors";
import type { ConversionEvent } from "./conversionEventsList";

/**
 * Wrapper for GA4 Admin API `properties.conversionEvents.create` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: POST {adminBase}/v1beta/properties/{propertyId}/conversionEvents
 * Body: `{ eventName, countingMethod?, custom? }`.
 * Returns: the created `ConversionEvent` (`name`, `eventName`,
 * `countingMethod`, ...). No secrets in the response.
 *
 * Backs the `create_conversion_event` handler. A 409 ("already exists") is
 * surfaced as a typed `AnalyticsApiError` (the handler maps it to a clean
 * failure). Auth wraps via refreshAndRetry. Errors sanitized.
 */
export async function conversionEventsCreate(input: {
  accessToken: string;
  propertyId: string;
  eventName: string;
  countingMethod?: string;
  custom?: boolean;
}): Promise<ConversionEvent> {
  const url = `${analyticsAdminApiBase()}/v1beta/properties/${encodeURIComponent(
    input.propertyId,
  )}/conversionEvents`;

  const body: Record<string, unknown> = { eventName: input.eventName };
  if (input.countingMethod !== undefined) body.countingMethod = input.countingMethod;
  if (input.custom !== undefined) body.custom = input.custom;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Analytics conversionEvents.create returned HTTP 401",
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
  return (text.length === 0 ? {} : JSON.parse(text)) as ConversionEvent;
}
