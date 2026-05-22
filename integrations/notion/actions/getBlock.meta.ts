import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:get_block`.
 *
 * Mirrors `getBlock.schema.ts`: single required `blockId` accepting
 * either a block id OR a page id (Notion treats pages as blocks at the
 * API level). Same dual-meaning as `append_block_children` /
 * `list_comments` / `get_block_children`.
 *
 * Outputs match `getBlock.ts:return` — `{blockId, object, type, archived,
 * hasChildren, parentType, parentId, createdTime, lastEditedTime,
 * plainText, content}`. `content` is the type-specific block payload
 * (bounded by Notion's per-type shape) declared as `object`. Workflow
 * authors needing rich-text-bearing block text use `plainText` directly;
 * image / file blocks read from `content` (no FileRef boundary — Notion
 * block-level file urls live inside `content`, not as a top-level
 * FileRef).
 */
export const notionGetBlockMeta: ActionMeta = {
  key: "notion:get_block",
  provider: "notion",
  type: "get_block",
  displayName: "Get Block",
  description:
    "Fetch a single Notion block by id. Accepts both block ids and page ids (pages are blocks in Notion). Returns a stable flat projection — type-specific payload lives under `content`, rich-text content is also pre-extracted as `plainText`.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "blockId",
      label: "Block / page ID",
      description:
        "Notion id to fetch. Accepts both block ids and page ids — Notion treats pages as blocks at the API level.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
  ],
  outputs: [
    {
      name: "blockId",
      type: "string",
      description: "Notion block id (echoed from the response).",
    },
    {
      name: "object",
      type: "string",
      description: "Always 'block' — useful when downstream code branches on object type.",
    },
    {
      name: "type",
      type: "string",
      description:
        "Block type — `paragraph`, `heading_1`, `to_do`, `divider`, etc. Null when Notion's response omits it.",
    },
    {
      name: "archived",
      type: "boolean",
      description: "Whether the block is archived.",
    },
    {
      name: "hasChildren",
      type: "boolean",
      description: "Whether the block has child blocks — drives whether `get_block_children` will return anything.",
    },
    {
      name: "parentType",
      type: "string",
      description: "Parent kind — `page_id` / `block_id` / `database_id` / `workspace`. Null when absent.",
    },
    {
      name: "parentId",
      type: "string",
      description: "Resolved parent id (page / block / database). Null when absent.",
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
      name: "plainText",
      type: "string",
      description:
        "Pre-extracted plain text for rich-text-bearing block types (paragraph, headings, list items, to_do, quote, callout, code, toggle). Empty string for non-text blocks (divider, image, embed, …).",
    },
    {
      name: "content",
      type: "object",
      description:
        "Type-specific Notion payload — `result[result.type]`. For text-bearing blocks this carries the raw `rich_text` array; for media blocks it carries the source url + metadata. Drill via `{{nodeId.content.<key>}}`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
};
