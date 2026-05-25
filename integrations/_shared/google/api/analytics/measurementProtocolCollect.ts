import { measurementProtocolBase } from "./_base";
import { AnalyticsApiError } from "./errors";

/**
 * Wrapper for the GA4 **Measurement Protocol** `mp/collect` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Endpoint: POST {mpBase}/mp/collect?measurement_id=...&api_secret=...
 * Body: `{ client_id, events:[{name, params}], user_id? }`.
 * Success: HTTP 204 (no content) or 200.
 *
 * **Security (load-bearing):** the request URL embeds the `api_secret`, and
 * the body carries `client_id` / `user_id` / event params. This wrapper
 * therefore NEVER includes the URL, the body, or the response text in a
 * thrown error — only the HTTP status. It also does NOT go through
 * refreshAndRetry's 401 path (the Measurement Protocol authenticates with
 * the `api_secret`, NOT the OAuth bearer — a 401/403 here means a bad
 * secret/measurement id, not an expired OAuth token).
 */
export interface MeasurementProtocolCollectInput {
  measurementId: string;
  apiSecret: string;
  clientId: string;
  eventName: string;
  eventParams?: Record<string, unknown>;
  userId?: string;
}

export async function measurementProtocolCollect(
  input: MeasurementProtocolCollectInput,
): Promise<{ status: number }> {
  const url = new URL(`${measurementProtocolBase()}/mp/collect`);
  url.searchParams.set("measurement_id", input.measurementId);
  url.searchParams.set("api_secret", input.apiSecret);

  const payload: Record<string, unknown> = {
    client_id: input.clientId,
    events: [
      {
        name: input.eventName,
        params: input.eventParams ?? {},
      },
    ],
  };
  if (input.userId !== undefined) payload.user_id = input.userId;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 204 || res.status === 200) {
    return { status: res.status };
  }
  // SECURITY: never echo the URL (embeds api_secret), the payload
  // (client_id / user_id / params), or the response body — status only.
  throw new AnalyticsApiError(`HTTP ${res.status}`, res.status);
}
