import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/calendars` — the viewer's calendars.
 *
 * Added for the `microsoft-outlook-calendar:calendars` options resolver
 * (ANALYTICS-SOURCES-OUTLOOK-CAL-1), which backs the (optional) calendar picker on
 * the Outlook Calendar analytics widgets.
 *
 * PRIVACY / scope: `$select=id,name` only — no events, attendees, or body. Single
 * page, `$top`-capped. Uses the already-granted `Calendars.ReadWrite` scope (a
 * superset of `Calendars.Read`); no new scope.
 *
 * Throws `Unauthorized401Error` on 401 (caught by refreshAndRetry); generic
 * `Error` with a surfaced (token-free) Graph message otherwise.
 */

export interface GraphCalendar {
  id: string;
  name?: string | null;
}

export interface ListCalendarsResult {
  value: GraphCalendar[];
}

export interface ListCalendarsInput {
  accessToken: string;
  /** 1..100 page cap (defensively clamped). */
  top?: number;
}

export async function listCalendars(
  input: ListCalendarsInput,
): Promise<ListCalendarsResult> {
  const top = Math.max(1, Math.min(input.top ?? 100, 100));
  const params = new URLSearchParams();
  params.append("$select", "id,name");
  params.append("$top", String(top));
  const url = `${graphApiBase()}/v1.0/me/calendars?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph GET me/calendars returned HTTP 401");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/calendars failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as ListCalendarsResult;
}
