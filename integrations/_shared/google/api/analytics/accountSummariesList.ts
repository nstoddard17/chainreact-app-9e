import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { analyticsAdminApiBase } from "./_base";
import {
  AnalyticsApiError,
  AnalyticsQuotaError,
  isQuotaStatus,
  surfaceAnalyticsErrorDetail,
} from "./errors";

/**
 * Wrapper for GA4 Admin API `accountSummaries.list` — Slice
 * 3.GOOGLE-ANALYTICS-3.
 *
 * Endpoint: GET {adminBase}/v1beta/accountSummaries?pageSize=200
 * Returns: `{ accountSummaries: [{ account, displayName, propertySummaries:
 *           [{ property, displayName, propertyType }] }] }`.
 *
 * One call backs BOTH the `accounts` resolver (top-level accounts) AND the
 * `properties` resolver (the property summaries nested per account, filtered
 * by the chosen account) — mirrors V1, which derived both from the same
 * call. Single bounded page (most users have few accounts). Auth wraps via
 * refreshAndRetry; errors sanitized (only the GA `error.status` tag).
 */
export interface PropertySummary {
  /** Resource name: `properties/{propertyId}`. */
  property?: string;
  displayName?: string;
  propertyType?: string;
  parent?: string;
}

export interface AccountSummary {
  /** Resource name: `accountSummaries/{id}`. */
  name?: string;
  /** Resource name: `accounts/{accountId}`. */
  account?: string;
  displayName?: string;
  propertySummaries?: PropertySummary[];
}

export interface AccountSummariesListResponse {
  accountSummaries?: AccountSummary[];
  nextPageToken?: string;
}

export async function accountSummariesList(input: {
  accessToken: string;
  pageSize?: number;
}): Promise<AccountSummariesListResponse> {
  const url = `${analyticsAdminApiBase()}/v1beta/accountSummaries?pageSize=${
    input.pageSize ?? 200
  }`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Analytics accountSummaries.list returned HTTP 401",
    );
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
  return (text.length === 0 ? {} : JSON.parse(text)) as AccountSummariesListResponse;
}
