import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:get_page`.
 *
 * Mirrors `getPage.schema.ts`: a single required `pageId`. Handler
 * parses the 9 supported property types into a typed map; unsupported
 * types surface in `skippedProperties` (workflows degrade gracefully
 * rather than throwing on a single unfamiliar property).
 *
 * Outputs match `getPage.ts:return` — `{pageId, url, archived, parent,
 * createdTime, lastEditedTime, properties, skippedProperties, icon,
 * cover}`.
 */
export const notionGetPageMeta: ActionMeta = {
  key: "notion:get_page",
  provider: "notion",
  type: "get_page",
  displayName: "Get Page",
  description:
    "Fetch a single Notion page by id, including parsed properties for the 9 supported property types. Unsupported types (relation, people, files, rollup, formula, multi_select, status) surface in `skippedProperties` rather than failing the whole call.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page ID",
      description:
        "Notion page id. Accepts both bare-page ids and database-row ids.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
  ],
  outputs: [
    {
      name: "pageId",
      type: "string",
      description: "Notion page id (echoed from the response).",
    },
    {
      name: "url",
      type: "string",
      description: "Public Notion URL.",
    },
    {
      name: "archived",
      type: "boolean",
      description: "Whether the page is archived.",
    },
    {
      name: "parent",
      type: "object",
      description:
        "Notion parent object — drill `parent.type` (`database_id` / `page_id` / `workspace`) plus the id.",
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
        "Parsed property map — `Record<propertyName, ParsedPropertyValue>`. Drill via `properties.<Name>.value`.",
    },
    {
      name: "skippedProperties",
      type: "array",
      description:
        "Array of `{name, type}` entries for properties whose type isn't supported in V2 (relation / people / files / rollup / formula / multi_select / status). Empty when every property parsed cleanly.",
    },
    {
      name: "icon",
      type: "object",
      description:
        "Notion icon object — discriminated `{type:'emoji',emoji}` or `{type:'external',external:{url}}`. Null when the page has no icon.",
    },
    {
      name: "cover",
      type: "object",
      description:
        "Notion cover object — `{type:'external',external:{url}}`. Null when the page has no cover.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
};
