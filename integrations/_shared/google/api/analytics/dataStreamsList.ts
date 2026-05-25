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
 * Wrapper for GA4 Admin API `properties.dataStreams.list` — Slice
 * 3.GOOGLE-ANALYTICS-3.
 *
 * Endpoint: GET {adminBase}/v1beta/properties/{propertyId}/dataStreams
 * Returns: `{ dataStreams: [{ name, type, displayName, webStreamData?:
 *           { measurementId, defaultUri } }] }`.
 *
 * Backs the `data_streams` resolver. Only WEB streams carry a `measurementId`
 * (`G-XXXX`); app streams use a Firebase app id. The resolver filters to the
 * web streams (the Measurement Protocol's `measurement_id` consumer). Single
 * bounded page. Auth wraps via refreshAndRetry; errors sanitized.
 *
 * **Security:** the response carries NO Measurement Protocol api_secret
 * (secrets are a separate `measurementProtocolSecrets` sub-resource that this
 * wrapper never reads). `measurementId` is a public stream identifier.
 */
export interface DataStream {
  /** Resource name: `properties/{property}/dataStreams/{streamId}`. */
  name?: string;
  /** WEB_DATA_STREAM / ANDROID_APP_DATA_STREAM / IOS_APP_DATA_STREAM. */
  type?: string;
  displayName?: string;
  webStreamData?: {
    /** `G-XXXXXXXXXX` — only present on WEB streams. */
    measurementId?: string;
    defaultUri?: string;
  };
}

export interface DataStreamsListResponse {
  dataStreams?: DataStream[];
  nextPageToken?: string;
}

export async function dataStreamsList(input: {
  accessToken: string;
  propertyId: string;
  pageSize?: number;
}): Promise<DataStreamsListResponse> {
  const url = `${analyticsAdminApiBase()}/v1beta/properties/${encodeURIComponent(
    input.propertyId,
  )}/dataStreams?pageSize=${input.pageSize ?? 200}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Analytics dataStreams.list returned HTTP 401",
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
  return (text.length === 0 ? {} : JSON.parse(text)) as DataStreamsListResponse;
}
