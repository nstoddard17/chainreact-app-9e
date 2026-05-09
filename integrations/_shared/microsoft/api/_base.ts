/**
 * Microsoft Graph API base URL — shared across every Microsoft provider.
 *
 * Graph lives at `graph.microsoft.com/v1.0` in production. The
 * `MICROSOFT_GRAPH_API_BASE` env var is an e2e-only override that lets
 * the mock server (Slice 6 walkthrough + Slice 7 walkthrough) own the
 * API root without coupling it to OAuth bases — same split Sheets uses
 * (`GOOGLE_SHEETS_API_BASE` vs `GOOGLE_TOKEN_BASE`).
 *
 * Read by:
 *   - `_shared/microsoft/oauth.ts` (Graph /me lookup at callback time).
 *   - `_shared/microsoft/api/me.ts` (Graph /me wrapper).
 *   - `_shared/microsoft/api/subscriptions.ts` (subscription CRUD).
 *   - per-provider api wrappers (sendMail, getMessage, eventsCreate,
 *     eventsList, eventsGet, eventsUpdate, eventsDelete).
 *
 * Slice 7: extracted from `integrations/microsoft-outlook/api/_base.ts`
 * so Outlook Calendar + Outlook Mail share one source of truth.
 */
export function graphApiBase(): string {
  return process.env.MICROSOFT_GRAPH_API_BASE ?? "https://graph.microsoft.com";
}
