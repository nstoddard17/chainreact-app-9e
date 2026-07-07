import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:append_block_children`.
 *
 * Mirrors `appendBlockChildren.schema.ts`:
 *   - `blockId`  (required) — block id OR page id (Notion treats pages
 *                as block parents at the API level). Same dual-meaning
 *                accepted on `get_block` / `list_comments` /
 *                `get_block_children`.
 *   - `children` (required) — typed `BlockSpec[]` (1..100). 9 supported
 *                block types: paragraph, heading_1, heading_2, heading_3,
 *                bulleted_list_item, numbered_list_item, quote, to_do,
 *                divider. Notion caps `append-children` at 100 per request.
 *
 * Outputs match `appendBlockChildren.ts:return` — `{childIds: string[],
 * count: number}`. The full block payloads are intentionally NOT
 * echoed; they're only marginally useful downstream and would bloat
 * the engine run record.
 */
export const notionAppendBlockChildrenMeta: ActionMeta = {
  key: "notion:append_block_children",
  provider: "notion",
  type: "append_block_children",
  displayName: "Append Block Children",
  description:
    "Append a typed list of block specs as children of an existing block or page. Accepts a block id OR a page id (pages are blocks in Notion's data model). Children is a JSON array of BlockSpec entries; runtime caps the array at 100 (Notion's hard ceiling). Enter a literal or wire `{{...}}` from upstream.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "blockId",
      label: "Block / page ID",
      description:
        "Notion id to append children under. Accepts both block ids and page ids — Notion treats pages as block parents. Usually wired from upstream `{{notion:create_page.pageId}}` or `{{notion:get_block.blockId}}`.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "children",
      label: "Children blocks",
      description:
        "Typed `BlockSpec[]` JSON array (1..100). Supported types: `paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `quote`, `to_do`, `divider`. Each entry is `{\"type\":\"<one of the above>\",\"text\":\"…\"}` (to_do additionally accepts `\"checked\":boolean`). Enter JSON or wire `{{...}}` from upstream array outputs.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "array",
      placeholder: '[{"type":"paragraph","text":"Hello"}]',
    },
  ],
  outputs: [
    {
      name: "childIds",
      type: "array",
      description:
        "Ids of the newly-created blocks (in append order). Drill via `{{nodeId.childIds[0]}}` to wire into a follow-up `append_block_children` or `get_block`.",
    },
    {
      name: "count",
      type: "number",
      description: "Number of blocks created — equals `childIds.length`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
