import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:create_database`.
 *
 * Mirrors `createDatabase.schema.ts`:
 *   - `parentPageId` (required) — page id under which the database is
 *                    created. Workspace-level databases not supported in
 *                    this batch.
 *   - `title`        (required) — plain-text database title (the wrapper
 *                    synthesizes the Notion rich_text array).
 *   - `description`  (optional) — plain-text description.
 *   - `isInline`     (optional) — Q11 — undefined is omitted from the
 *                    request body (Notion defaults to false). Authors
 *                    pick explicitly.
 *   - `properties`   (required) — `Record<name, {type: SupportedPropertyType}>`.
 *                    Notion REQUIRES exactly one property of type "title"
 *                    — schema-`refine` enforces it at runtime. The 9
 *                    supported property types are the V2
 *                    `SUPPORTED_PROPERTY_TYPES` set.
 *
 * Cross-field invariants (runtime-enforced, NOT expressible in FieldMeta):
 *   - `properties` must declare at least one entry.
 *   - `properties` must include EXACTLY ONE entry whose `type === "title"`.
 *
 * Outputs match `createDatabase.ts:return` — see the field list below.
 */
export const notionCreateDatabaseMeta: ActionMeta = {
  key: "notion:create_database",
  provider: "notion",
  type: "create_database",
  displayName: "Create Database",
  description:
    "Create a new Notion database under an existing parent page. Properties declare the column schema — Notion REQUIRES exactly one property of type 'title' (runtime validates). Inline vs. full-page is an explicit choice — no hidden default.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "parentPageId",
      label: "Parent page ID",
      description:
        "Page id under which the database is created. Workspace-level databases are not supported in this batch.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "title",
      label: "Title",
      description:
        "Plain-text database title. The wrapper synthesizes Notion's rich_text array.",
      type: "text",
      required: true,
      placeholder: "Q4 OKRs",
    },
    {
      name: "description",
      label: "Description",
      description:
        "Optional plain-text description. The wrapper synthesizes Notion's rich_text array.",
      type: "textarea",
      required: false,
      placeholder: "Tracking quarterly objectives and key results.",
    },
    {
      name: "isInline",
      label: "Inline",
      description:
        "When true the database renders inline inside the parent page; when false it occupies its own full page. Omit to defer to Notion's default (full-page).",
      type: "boolean",
      required: false,
    },
    {
      name: "properties",
      label: "Properties (column schema)",
      description:
        "Column-schema map — `{\"<name>\":{\"type\":\"<supported type>\"}, ...}`. Runtime requires EXACTLY ONE entry of type 'title'. Supported types: `title`, `rich_text`, `number`, `select`, `checkbox`, `date`, `url`, `email`, `phone_number`. Option-set configuration (select options) is not supported in this batch — configure manually in Notion's UI after creation.",
      type: "textarea",
      required: true,
      placeholder: '{"Name":{"type":"title"},"Status":{"type":"select"}}',
    },
  ],
  outputs: [
    {
      name: "databaseId",
      type: "string",
      description:
        "Notion database id. Wire to `query_database.databaseId` / `create_database_entry.databaseId` downstream.",
    },
    {
      name: "object",
      type: "string",
      description: "Always 'database' — useful when downstream code branches on object type.",
    },
    {
      name: "url",
      type: "string",
      description: "Public Notion URL for the database.",
    },
    {
      name: "title",
      type: "string",
      description: "Plain-text title reconstructed from Notion's rich_text response.",
    },
    {
      name: "description",
      type: "string",
      description: "Plain-text description reconstructed; empty string when absent.",
    },
    {
      name: "archived",
      type: "boolean",
      description: "Archived state at creation (always false).",
    },
    {
      name: "isInline",
      type: "boolean",
      description: "Whether the database renders inline inside the parent page.",
    },
    {
      name: "parentType",
      type: "string",
      description: "Parent kind — typically `page_id` for this action.",
    },
    {
      name: "parentId",
      type: "string",
      description: "Parent page / block id.",
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
    {
      name: "properties",
      type: "object",
      description:
        "Raw Notion column-schema map echoed from the response — drill by property name. This is the same shape downstream `query_database` / `create_database_entry` references by name.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
};
