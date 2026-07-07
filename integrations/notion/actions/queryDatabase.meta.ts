import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:query_database`.
 *
 * Mirrors `queryDatabase.schema.ts`:
 *   - `databaseId` (required) — database to query.
 *   - `filter`     (optional) — raw Notion filter object passed verbatim
 *                  to the API. V2 deliberately does NOT re-derive Notion's
 *                  filter grammar; Notion validates server-side.
 *   - `sorts`      (optional) — raw Notion sort array passed verbatim.
 *   - `pageSize`   (optional) — 1..100 (Notion's hard ceiling).
 *
 * `startCursor` is server-managed and intentionally NOT exposed — call
 * the action again with `{{prev.nextCursor}}` for page 2. Matches the
 * established pagination convention across the codebase.
 *
 * Outputs match `queryDatabase.ts:return` — `{results: array, hasMore,
 * nextCursor}`. Each row carries `{id, url, archived, createdTime,
 * lastEditedTime, properties, skippedProperties}`.
 */
export const notionQueryDatabaseMeta: ActionMeta = {
  key: "notion:query_database",
  provider: "notion",
  type: "query_database",
  displayName: "Query Database",
  description:
    "Query rows from a Notion database. `filter` and `sorts` are passed verbatim to Notion's API — see Notion's docs for the grammar. Enter a JSON literal or wire `{{...}}` from upstream. Returns one page of rows; iterate via the returned `nextCursor` for additional pages.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "databaseId",
      label: "Database ID",
      description:
        "Notion database id to query. Usually wired from `{{notion:create_database.databaseId}}` / `{{notion:search.results[0].id}}`.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "filter",
      label: "Filter",
      description:
        "Optional raw Notion filter object — passed verbatim to `databases.query`. See Notion's filter docs for the grammar (compound `and`/`or` plus per-property filters). Enter JSON or wire `{{...}}`.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '{"property":"Status","select":{"equals":"Done"}}',
    },
    {
      name: "sorts",
      label: "Sorts",
      description:
        "Optional raw Notion sort array — passed verbatim. Each entry is `{property, direction}` or `{timestamp, direction}`. Enter JSON or wire `{{...}}`.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '[{"property":"Name","direction":"ascending"}]',
    },
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max rows per call (1..100, Notion's hard ceiling). Omit to use Notion's default.",
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
        "Array of parsed rows. Each entry carries `{id, url, archived, createdTime, lastEditedTime, properties: object, skippedProperties: array}`. Drill via `{{nodeId.results[0].properties.Name.value}}`.",
      sensitive: true,
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available — call this action again with `nextCursor` to fetch it.",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque pagination cursor for the next page. Null when there are no more pages.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
