import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { calendarApiBase } from "./_base";

/**
 * Wrapper for Google Calendar `calendarList.list`.
 *
 * Endpoint: GET {base}/calendar/v3/users/me/calendarList
 * Lists the calendars on the user's calendar list (the picker source for the
 * `calendarId` config field). Read-only.
 *
 * SCOPE: requires `calendar.calendarlist.readonly` (the manifest's optional
 * scope since GOOGLE-OAUTH-SCOPE-MINIMIZATION-1) or a superset —
 * `calendar.calendarlist`, `calendar.readonly` (granted by pre-minimization
 * tokens), or full `calendar`. The `calendar.events` scope does NOT grant
 * this — a token holding none of the accepted scopes returns HTTP 403
 * (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`). We surface that as
 * `InsufficientScopeError` so the resolver maps it to a reconnect prompt
 * (refreshing the token would keep the same scopes and cannot fix it).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refresh+retry can fix).
 *   - `InsufficientScopeError` on HTTP 403 (missing scope — reconnect needed).
 *   - generic `Error` on other failures.
 */
export interface CalendarListEntry {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  accessRole?: string;
  deleted?: boolean;
  [k: string]: unknown;
}

export interface CalendarListResult {
  kind?: string;
  items?: ReadonlyArray<CalendarListEntry>;
  nextPageToken?: string;
  [k: string]: unknown;
}

export interface CalendarListInput {
  accessToken: string;
  /** Minimum access role to return. Default "reader" (read+write calendars). */
  minAccessRole?: "freeBusyReader" | "owner" | "reader" | "writer";
  /** Max entries per page (Google caps at 250). */
  maxResults?: number;
  pageToken?: string;
}

interface CalendarErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as CalendarErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function calendarListList(
  input: CalendarListInput,
): Promise<CalendarListResult> {
  const url = new URL(`${calendarApiBase()}/calendar/v3/users/me/calendarList`);
  url.searchParams.set("minAccessRole", input.minAccessRole ?? "reader");
  url.searchParams.set("maxResults", String(input.maxResults ?? 250));
  url.searchParams.set("showHidden", "false");
  url.searchParams.set("showDeleted", "false");
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Calendar calendarList.list returned HTTP 401",
    );
  }
  if (res.status === 403) {
    // Token lacks every calendarList-capable scope (predates both the
    // calendar.readonly add and its granular replacement).
    // Do NOT surface Google's raw body — just a typed reconnect signal.
    throw new InsufficientScopeError(
      "Google Calendar calendarList.list returned HTTP 403 (insufficient scope)",
      "google-calendar",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Calendar calendarList.list failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as CalendarListResult;
}
