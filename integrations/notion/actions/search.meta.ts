import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:search`.
 *
 * Mirrors `search.schema.ts`:
 *   - `query`    (required, but empty allowed) — string. Empty means "all
 *                accessible objects." Schema accepts `z.string()` (key
 *                must be present; value can be empty).
 *   - `filter`   (optional) — `{value: "page" | "database",
 *                property: "object"}`. The two-field discriminated shape
 *                doesn't fit a single FieldType — paste-JSON for v1.
 *   - `pageSize` (optional) — 1..100.
 *
 * `startCursor` is server-managed; NOT exposed.
 *
 * Outputs match `search.ts:return` — `{results: array, hasMore,
 * nextCursor}`. **Known asymmetry:** `results` items are raw Notion
 * search hits (the handler intentionally surfaces them as-is per
 * `search.ts:42-48` — workflows chain `get_page` for typed property
 * values). Meta declares `results: array` and lets the variable picker
 * drill on a per-hit basis.
 */
export const notionSearchMeta: ActionMeta = {
  key: "notion:search",
  provider: "notion",
  type: "search",
  displayName: "Search",
  description:
    "Search across all Notion objects the integration can see — pages AND databases. Empty `query` returns all accessible objects. Use `filter` to narrow by object type. Results are raw Notion search hits — chain Get Page for typed property values.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "query",
      label: "Search query",
      description:
        "Search text. Submit an empty string to return all accessible objects (Notion's `/v1/search` accepts empty-query lists). Notion's search is title-only; full-text body search is not available via this endpoint.",
      type: "text",
      required: true,
      placeholder: "Q4 OKRs",
    },
    {
      name: "filter",
      label: "Filter (object type)",
      description:
        "Optional. Narrow to pages OR databases — `{\"value\":\"page\",\"property\":\"object\"}` or `{\"value\":\"database\",\"property\":\"object\"}`. Notion's API rejects any other shape.",
      type: "textarea",
      required: false,
      placeholder: '{"value":"page","property":"object"}',
    },
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max results per call (1..100). Omit to use Notion's default.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "results",
      type: "array",
      description:
        "Array of raw Notion search hits — each hit carries `object: 'page' | 'database'`, `id`, `url`, `parent`, etc. Chain Get Page for typed property values on page-shaped hits.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available.",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque pagination cursor for the next page. Null when there are no more pages.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
};
