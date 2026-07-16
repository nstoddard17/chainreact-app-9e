import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:get_block_children`.
 *
 * Mirrors `getBlockChildren.schema.ts`:
 *   - `blockId`  (required) — block id OR page id (dual-meaning).
 *   - `pageSize` (optional) — 1..100 (Notion's hard ceiling).
 *
 * `startCursor` is server-managed; intentionally NOT exposed — call
 * the action again with `{{prev.nextCursor}}` for page 2.
 *
 * Outputs match `getBlockChildren.ts:return` — `{blocks: array,
 * nextCursor, hasMore}`. Each `blocks` entry matches `get_block`'s
 * output shape exactly (single + list parity via the shared
 * `mapNotionBlock` helper).
 */
export const notionGetBlockChildrenMeta: ActionMeta = {
  key: "notion:get_block_children",
  provider: "notion",
  type: "get_block_children",
  displayName: "Get Block Children",
  description:
    "List the child blocks of a Notion block or page. Single page of results — call again with the returned `nextCursor` for additional pages. Each entry matches Get Block's output shape (drill via `{{nodeId.blocks[0].plainText}}` etc.).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "blockId",
      label: "Block / page ID",
      description:
        "Notion id to list children for. Accepts both block ids and page ids.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max children per call (1..100, Notion's hard ceiling). Omit to use Notion's default.",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "blocks",
      type: "array",
      description:
        "Array of child blocks — each entry matches Get Block's output shape (`{blockId, object, type, archived, hasChildren, parentType, parentId, createdTime, lastEditedTime, plainText, content}`). Marked sensitive — per-row block bodies are user-typed content; redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque pagination cursor for the next page. Null when there are no more pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available — call this action again with `nextCursor` to fetch it.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
