import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:create_comment`.
 *
 * Mirrors `createComment.schema.ts`:
 *   - `pageId`       (optional) — creates a NEW discussion thread on
 *                    the named page.
 *   - `discussionId` (optional) — adds a comment to an EXISTING
 *                    discussion thread (returned in the `discussionId`
 *                    field of any prior comment).
 *   - `text`         (required) — plain-text body. The wrapper
 *                    synthesizes Notion's rich_text array; raw
 *                    rich_text JSON passthrough is NOT supported.
 *
 * Cross-field invariant (runtime-enforced, NOT expressible in FieldMeta):
 * EXACTLY ONE of `pageId` / `discussionId` must be set — Notion rejects
 * requests carrying both or neither. The description documents this;
 * the schema's `.refine` enforces it on save.
 *
 * Outputs match `createComment.ts:return` — `{commentId, object,
 * parentType, parentId, parentBlockId, discussionId, plainText,
 * createdTime, lastEditedTime, createdByUserId}`. Reused via
 * `mapNotionComment` so `create_comment` and `list_comments` share
 * the entry shape.
 */
export const notionCreateCommentMeta: ActionMeta = {
  key: "notion:create_comment",
  provider: "notion",
  type: "create_comment",
  displayName: "Create Comment",
  description:
    "Post a comment to Notion. Set EXACTLY ONE of Page ID (starts a new discussion thread on a page) or Discussion ID (replies to an existing thread). Notion rejects requests carrying both or neither. Block-level comments are NOT supported by Notion's public API.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description:
        "Page to start a NEW comment thread on. Set this OR Discussion ID — exactly one. Pick a page, paste an id, or wire `{{...}}` from an upstream step.",
      type: "combobox",
      optionsSource: "notion:pages",
      allowManualEntry: true,
      required: false,
      placeholder: "Select a page, or paste an id",
    },
    {
      name: "discussionId",
      label: "Discussion ID",
      description:
        "Existing thread to reply to (from a previous comment step's `discussionId` output). Set this OR Page — exactly one.",
      type: "text",
      required: false,
      placeholder: "efgh5678-...",
    },
    {
      name: "text",
      label: "Comment text",
      description:
        "Plain-text comment body. The wrapper synthesizes Notion's rich_text array. Raw rich_text JSON passthrough is not supported in v1.",
      type: "textarea",
      required: true,
      placeholder: "Looks great — shipping today.",
    },
  ],
  outputs: [
    {
      name: "commentId",
      type: "string",
      description: "Notion comment id.",
    },
    {
      name: "object",
      type: "string",
      description: "Always 'comment'.",
    },
    {
      name: "parentType",
      type: "string",
      description:
        "Parent kind — typically `page_id` (or `block_id` if Notion ever returns one). Null when absent.",
    },
    {
      name: "parentId",
      type: "string",
      description: "Page id when `parentType === 'page_id'`. Null otherwise.",
    },
    {
      name: "parentBlockId",
      type: "string",
      description: "Block id when `parentType === 'block_id'`. Null otherwise.",
    },
    {
      name: "discussionId",
      type: "string",
      description:
        "Notion discussion thread id — wire this into a follow-up `create_comment.discussionId` to reply on the same thread.",
    },
    {
      name: "plainText",
      type: "string",
      description:
        "Pre-extracted plain text from the comment's rich_text array (matches what was posted). Marked sensitive — comment body is user-typed PII-bearing content; redacts from the run-detail API and variable picker preview.",
      sensitive: true,
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
      name: "createdByUserId",
      type: "string",
      description: "Notion user id of the comment author (typically the bot user for integration-posted comments).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
