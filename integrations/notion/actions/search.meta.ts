import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:search`.
 *
 * Mirrors `search.schema.ts`:
 *   - `query`    (required, but empty allowed) — string. Empty means "all
 *                accessible objects." Schema accepts `z.string()` (key
 *                must be present; value can be empty).
 *   - `filter`   (optional) — `{value: "page" | "database",
 *                property: "object"}`. Flat two-key shape → `object`
 *                editor (CONFIG-UX sweep): `value` select + `property`
 *                select (single legal option). Commits the identical
 *                object the runtime schema expects; all-empty commits
 *                `undefined` so the optional filter drops out.
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
      // Empty string is a VALID value here ("search all accessible objects" —
      // the schema accepts `z.string()` and the handler treats "" as the
      // all-objects list). Seed "" so the builder's deriveDefaultConfig writes
      // the key (mirrors gmail:send_email subject) AND so readiness treats this
      // required field as satisfied by its default — empty query is not a gap.
      defaultValue: "",
      placeholder: "Q4 OKRs",
    },
    {
      name: "filter",
      label: "Filter (object type)",
      description:
        "Optional. Return only pages or only databases. Set both choices to apply the filter, or leave both empty to search everything.",
      type: "object",
      required: false,
      advanced: true,
      itemFields: [
        {
          name: "value",
          label: "Show only",
          description: "Which object type to return.",
          type: "select",
          required: true,
          options: [
            { value: "page", label: "Pages" },
            { value: "database", label: "Databases" },
          ],
          placeholder: "Choose…",
        },
        {
          name: "property",
          label: "Filter by",
          description:
            "Notion only supports filtering by object type — pick it to apply the filter.",
          type: "select",
          required: true,
          options: [{ value: "object", label: "Object type" }],
          placeholder: "Choose…",
        },
      ],
    },
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max results per call (1..100). Omit to use Notion's default.",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "results",
      type: "array",
      description:
        "Array of raw Notion search hits — each hit carries `object: 'page' | 'database'`, `id`, `url`, `parent`, etc. Chain Get Page for typed property values on page-shaped hits. Marked sensitive — raw hits may carry page titles + property previews containing user-typed PII; parity with `query_database.results` (which is also sensitive).",
      sensitive: true,
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
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
