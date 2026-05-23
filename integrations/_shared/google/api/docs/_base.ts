/**
 * Google Docs API base URL.
 *
 * Mirrors `integrations/google-drive/api/_base.ts` shape. The Docs API
 * lives under `https://docs.googleapis.com` in production; the
 * `GOOGLE_DOCS_API_BASE` env var is an e2e-only override that lets the
 * walkthrough's mock server own the host without coupling to OAuth /
 * Drive bases.
 */
export function docsApiBase(): string {
  return process.env.GOOGLE_DOCS_API_BASE ?? "https://docs.googleapis.com";
}
