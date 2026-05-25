/**
 * Airtable REST API base URL — shared across the Airtable provider.
 *
 * Airtable's REST API lives at `api.airtable.com` in production. The
 * `AIRTABLE_API_BASE` env var is an e2e-only override that lets the
 * mock server (Slice 10 walkthrough) own the API root without coupling
 * it to the OAuth bases (`AIRTABLE_AUTHORIZE_BASE` /
 * `AIRTABLE_TOKEN_BASE`). Same split pattern as Notion
 * (`NOTION_API_BASE` vs `NOTION_AUTHORIZE_BASE`) and Microsoft
 * (`MICROSOFT_GRAPH_API_BASE` vs `MICROSOFT_AUTHORIZE_BASE`).
 *
 * API version pin — every Airtable REST request is implicitly under
 * `/v0/...`. The version is part of the path (not a header), so
 * wrappers prepend it directly.
 *
 * Read by:
 *   - `integrations/airtable/api/{_request,records,bases,tables}.ts`
 *   - Future: `integrations/airtable/triggers/recordChanged/*` (Commit 4)
 *     — webhook create / refresh / list payloads endpoints under
 *     `/v0/bases/{baseId}/webhooks/...`.
 */
export function airtableApiBase(): string {
  return process.env.AIRTABLE_API_BASE ?? "https://api.airtable.com";
}

/**
 * Pinned Airtable REST API version. Slice 10 uses `v0` for every
 * endpoint. Bumping requires a coordinated migration if Airtable ever
 * publishes `/v1` — record / schema / webhook payload shapes may shift.
 */
export const AIRTABLE_API_VERSION = "v0";
