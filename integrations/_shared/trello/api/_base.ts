/**
 * Trello API base URL + version pin — shared across the Trello provider.
 *
 * Trello's REST API lives at `api.trello.com` in production. The
 * `TRELLO_API_BASE` env var is an e2e-only override that lets a mock
 * server own the API root without coupling it to the authorize host
 * (`TRELLO_AUTHORIZE_BASE`). Same split pattern as Notion / GitHub /
 * Shopify.
 *
 * Trello's API uses a path-prefix version (`/1/`) rather than a
 * header version. The `TRELLO_API_VERSION` const here documents the
 * pinned major; bumping requires a coordinated migration across
 * actions because response shapes can shift between Trello versions.
 *
 * Read by:
 *   - `integrations/trello/api/_request.ts` (the shared request helper).
 *   - `integrations/trello/auth.ts` (reads the same env override).
 */
export function trelloApiBase(): string {
  return process.env.TRELLO_API_BASE ?? "https://api.trello.com";
}

/**
 * Pinned Trello REST API version. Path-prefixed into every URL.
 */
export const TRELLO_API_VERSION = "1";
