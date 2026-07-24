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
      label: "Block / page",
      description:
        "Notion page (or block) to list comments for. Pick a page, paste an id, or wire `{{...}}` from an upstream step. Accepts both block ids and page ids (pages are blocks in Notion).",
      type: "combobox",
      optionsSource: "notion:pages",
      // The `notion:pages` resolver enumerates PAGES via search, so a raw BLOCK
      // id — and any page search can't reach — must stay reachable. This also
      // enables the variable picker (ComboboxField gates it on the same flag),
      // which is what makes the description's "wire `{{...}}` from an upstream
      // step" true. Matches every sibling `notion:pages` field.
      allowManualEntry: true,
      required: true,
      placeholder: "Select a page, or paste an id",
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
