import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:list_comments`.
 *
 * Mirrors `listComments.schema.ts`:
 *   - `blockId`  (required) — Notion's API parameter name. Accepts both
 *                block ids AND page ids (workflow authors typically
 *                pass a page id here to list page-level comments).
 *   - `pageSize` (optional) — 1..100 (Notion's hard ceiling).
 *
 * `startCursor` is server-managed; intentionally NOT exposed.
 *
 * Outputs match `listComments.ts:return` — `{comments: array,
 * nextCursor, hasMore}`. Each `comments` entry matches
 * `create_comment`'s output shape exactly (shared via
 * `mapNotionComment`).
 */
export const notionListCommentsMeta: ActionMeta = {
  key: "notion:list_comments",
  provider: "notion",
  type: "list_comments",
  displayName: "List Comments",
  description:
    "List comments on a Notion block or page. Accepts both block ids and page ids — workflow authors typically pass a page id here. Single page of results — call again with `nextCursor` for additional pages. Each entry matches Create Comment's output shape.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "blockId",
      label: "Block / page ID",
      description:
        "Notion id to list comments for. Accepts both block ids and page ids — workflow authors typically pass a page id to list page-level comments.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "pageSize",
      label: "Page size",
      description:
        "Optional. Max comments per call (1..100, Notion's hard ceiling). Omit to use Notion's default.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "comments",
      type: "array",
      description:
        "Array of comments — each entry matches Create Comment's output shape (`{commentId, object, parentType, parentId, parentBlockId, discussionId, plainText, createdTime, lastEditedTime, createdByUserId}`). Marked sensitive — per-row `plainText` is user-typed content that redacts from the run-detail API and variable picker preview (token wiring still works).",
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
      description: "True when another page is available.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
