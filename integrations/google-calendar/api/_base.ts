/**
 * Google Calendar API base URL.
 *
 * Defaults to production. The `GOOGLE_CALENDAR_API_BASE` env var is an
 * e2e-only override that lets the mock server (Slice 3b walkthrough) own
 * the API root without coupling it to the OAuth bases. Three separate
 * vars (authorize, token, calendar API) per the Google-mock pattern.
 */
export function calendarApiBase(): string {
  return process.env.GOOGLE_CALENDAR_API_BASE ?? "https://www.googleapis.com";
}
