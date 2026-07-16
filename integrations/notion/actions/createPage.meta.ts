import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:create_page`.
 *
 * Mirrors `createPage.schema.ts`:
 *   - `parent`     (required) — discriminated `{databaseId} | {pageId}` JSON.
 *                  Textarea paste-JSON OR `{{...}}` reference. No structured
 *                  picker in v1; a future `notion:databases` / `notion:pages`
 *                  resolver can replace this with a discriminated UI.
 *   - `properties` (required) — typed property-input map.
 *                  `Record<name, {type, value}>`. Schema runs each entry
 *                  through `formatPropertyValue`; unsupported types throw
 *                  `UnsupportedPropertyTypeError` at runtime.
 *   - `children`   (optional) — typed `BlockSpec[]` (≤100). 9 supported
 *                  block types — see Slice 9 Batch 1.
 *   - `icon`       (optional) — `{type:"emoji",emoji} | {type:"external",external:{url}}`.
 *   - `cover`      (optional) — `{type:"external",external:{url}}`.
 *
 * Required Notion capabilities: `insert_content` (granted on connect; see
 * `integrations/notion/manifest.ts`).
 *
 * Outputs match `createPage.ts:return` — `{pageId, url, parent: object,
 * createdTime, lastEditedTime}`. `parent` is the bounded Notion parent
 * object echoed from the response.
 */
export const notionCreatePageMeta: ActionMeta = {
  key: "notion:create_page",
  provider: "notion",
  type: "create_page",
  displayName: "Create Page",
  description:
    "Create a Notion page as a database row OR as a subpage of an existing page. The `parent` field is a discriminated JSON object — choose one. `properties` carries the typed property-input map. `children` / `icon` / `cover` are optional typed JSON. Authors enter a JSON literal or wire a `{{...}}` reference from an upstream output.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "parent",
      label: "Parent",
      description:
        "Where the page is created: `{\"databaseId\":\"<id>\"}` adds a row to that database; `{\"pageId\":\"<id>\"}` creates a subpage. Set exactly one key, or wire `{{...}}` from upstream.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"databaseId":"abcd1234-..."}',
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "Typed property-input map — `{\"<name>\":{\"type\":\"<title|rich_text|number|select|checkbox|date|url|email|phone_number>\",\"value\":<typed value>}, ...}`. Unsupported types (relation, people, files, rollup, formula, multi_select, status) throw at runtime. See Notion's API docs for the value shapes.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"Name":{"type":"title","value":"New entry"}}',
    },
    {
      name: "children",
      label: "Children blocks",
      description:
        "Optional typed block array (≤100). 9 supported types: `paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `quote`, `to_do`, `divider`. Enter JSON or wire `{{...}}` from `notion:get_block_children.blocks`.",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "array",
      placeholder: '[{"type":"paragraph","text":"Hello"}]',
    },
    {
      name: "icon",
      label: "Icon",
      description:
        "Optional. Emoji form `{\"type\":\"emoji\",\"emoji\":\"🎯\"}` OR external URL form `{\"type\":\"external\",\"external\":{\"url\":\"https://...\"}}`.",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"type":"emoji","emoji":"🎯"}',
    },
    {
      name: "cover",
      label: "Cover",
      description:
        "Optional. External-URL only — `{\"type\":\"external\",\"external\":{\"url\":\"https://...\"}}`. Notion does not accept file-upload covers via the API.",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"type":"external","external":{"url":"https://..."}}',
    },
  ],
  outputs: [
    {
      name: "pageId",
      type: "string",
      description: "Notion page id. Wire to `update_page.pageId` / `get_page.pageId` / `archive_page.pageId` downstream.",
    },
    {
      name: "url",
      type: "string",
      description: "Public Notion URL for the page. Null when Notion's response omits it.",
    },
    {
      name: "parent",
      type: "object",
      description:
        "Notion parent object echoed from the response — drill `parent.type` (`database_id` / `page_id`) plus the id.",
    },
    {
      name: "createdTime",
      type: "string",
      description: "ISO 8601 timestamp.",
    },
    {
      name: "lastEditedTime",
      type: "string",
      description: "ISO 8601 timestamp.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
