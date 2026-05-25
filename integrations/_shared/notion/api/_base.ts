/**
 * Notion API base URL + version pin — shared across the Notion provider.
 *
 * Notion lives at `api.notion.com` in production. The `NOTION_API_BASE`
 * env var is an e2e-only override that lets the mock server (Slice 9
 * walkthrough) own the API root without coupling it to the OAuth base
 * (`NOTION_AUTHORIZE_BASE`). Same split pattern as Microsoft
 * (`MICROSOFT_GRAPH_API_BASE` vs `MICROSOFT_AUTHORIZE_BASE`) and
 * Sheets (`GOOGLE_SHEETS_API_BASE` vs `GOOGLE_TOKEN_BASE`).
 *
 * Notion-Version pin — every Notion API request MUST include the
 * `Notion-Version` header. Slice 9 pins `2022-06-28` for all 7 in-scope
 * actions; the newer `2025-09-03` API introduces multi-source databases
 * relevant only for triggers (which Slice 9 defers).
 *
 * Read by:
 *   - `integrations/notion/api/{pages,databases,blocks,search}.ts`
 *     (per-resource HTTP wrappers).
 *   - Future: `integrations/notion/api/users.ts` if a future slice adds
 *     `/v1/users/me` for health checks.
 */
export function notionApiBase(): string {
  return process.env.NOTION_API_BASE ?? "https://api.notion.com";
}

/**
 * Pinned Notion API version. Every wrapper sends this in the
 * `Notion-Version` header. Bumping requires a coordinated migration
 * across actions because property + block payload shapes can shift
 * between versions (e.g., 2025-09-03 introduced data_source_id).
 */
export const NOTION_API_VERSION = "2022-06-28";
