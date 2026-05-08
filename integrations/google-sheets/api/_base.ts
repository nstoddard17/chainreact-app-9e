/**
 * Google Sheets API base URL.
 *
 * Sheets lives at its own subdomain (`sheets.googleapis.com/v4`), distinct
 * from Drive's (`www.googleapis.com/drive/v3`) and Calendar's
 * (`www.googleapis.com/calendar/v3`). Defaults to production. The
 * `GOOGLE_SHEETS_API_BASE` env var is an e2e-only override that lets the
 * mock server (Slice 5b walkthrough) own the API root without coupling it
 * to OAuth bases.
 */
export function sheetsApiBase(): string {
  return process.env.GOOGLE_SHEETS_API_BASE ?? "https://sheets.googleapis.com";
}
