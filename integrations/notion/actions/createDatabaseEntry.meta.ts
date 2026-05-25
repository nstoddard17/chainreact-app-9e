import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:create_database_entry`.
 *
 * Mirrors `createDatabaseEntry.schema.ts`:
 *   - `databaseId` (required) — database the entry is created in.
 *   - `properties` (required) — typed property-input map (same shape as
 *                  create_page's properties). MUST include the database's
 *                  title property — Notion rejects requests missing it.
 *   - `children`   (optional) — typed `BlockSpec[]` (≤100).
 *   - `icon`       (optional) — same shape as create_page's icon.
 *   - `cover`      (optional) — same shape as create_page's cover.
 *
 * Effectively `create_page` with the database-parent constraint baked
 * in — kept separate so the schema is narrower (no page-parent fallback
 * field) and matches V1's separate node type.
 *
 * Outputs match `createDatabaseEntry.ts:return` — mirror `create_page`
 * (workflows reference `{{nodeId.pageId}}` interchangeably).
 */
export const notionCreateDatabaseEntryMeta: ActionMeta = {
  key: "notion:create_database_entry",
  provider: "notion",
  type: "create_database_entry",
  displayName: "Create Database Entry",
  description:
    "Create a new row in a Notion database. Effectively Create Page with the database-parent baked in. `properties` MUST include the database's title property — Notion rejects requests missing it.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "databaseId",
      label: "Database ID",
      description:
        "Notion database id. Usually wired from `{{notion:create_database.databaseId}}` / `{{notion:search.results[0].id}}`.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "Typed property-input map (same shape as Create Page). MUST include the database's title property. Unsupported types (relation, people, files, rollup, formula, multi_select, status) throw at runtime.",
      type: "textarea",
      required: true,
      placeholder: '{"Name":{"type":"title","value":"New row"}}',
    },
    {
      name: "children",
      label: "Children blocks",
      description:
        "Optional typed block array (≤100). Same 9 supported types as Create Page.",
      type: "textarea",
      required: false,
      placeholder: '[{"type":"paragraph","text":"Notes."}]',
    },
    {
      name: "icon",
      label: "Icon",
      description: "Optional. Same shape as Create Page.",
      type: "textarea",
      required: false,
      placeholder: '{"type":"emoji","emoji":"🎯"}',
    },
    {
      name: "cover",
      label: "Cover",
      description: "Optional. Same shape as Create Page (external URL only).",
      type: "textarea",
      required: false,
      placeholder: '{"type":"external","external":{"url":"https://..."}}',
    },
  ],
  outputs: [
    {
      name: "pageId",
      type: "string",
      description: "Notion page id (the new row).",
    },
    {
      name: "url",
      type: "string",
      description: "Public Notion URL.",
    },
    {
      name: "parent",
      type: "object",
      description: "Notion parent object (drill `parent.database_id`).",
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
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
