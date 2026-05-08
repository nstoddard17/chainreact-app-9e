/**
 * Microsoft Graph API base URL.
 *
 * Graph lives at `graph.microsoft.com/v1.0`. Defaults to production. The
 * `MICROSOFT_GRAPH_API_BASE` env var is an e2e-only override that lets the
 * mock server (Slice 6 walkthrough) own the API root without coupling it
 * to OAuth bases — same split Sheets uses (`GOOGLE_SHEETS_API_BASE` vs
 * `GOOGLE_TOKEN_BASE`).
 *
 * Read in oauth.ts (Graph /me lookup at callback time), api wrappers
 * (sendMail, getMessage, subscription endpoints), and webhook lifecycle.
 */
export function graphApiBase(): string {
  return process.env.MICROSOFT_GRAPH_API_BASE ?? "https://graph.microsoft.com";
}
