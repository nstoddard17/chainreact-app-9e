import { z } from "zod";

/**
 * Resolved-config schema for the Notion `create_comment` action.
 *
 * Notion 2.1 Commit 3 — comments.
 *
 * Discriminated target: EXACTLY ONE of `pageId` or `discussionId` must
 * be set. Notion's API rejects requests carrying both or neither.
 *
 *   - `pageId` — creates a NEW discussion thread on the named page.
 *   - `discussionId` — adds a comment to an EXISTING discussion thread
 *     (returned in the `discussionId` field of any prior comment).
 *
 * `text` is required. Wrapper synthesizes the rich_text array from this
 * plain-text input; raw rich_text JSON passthrough is NOT supported
 * (per V2 strict-schema convention).
 *
 * V1 chrome NOT carried:
 *   - Block-level parent (`parent_type === "block"`). V1's
 *     manageComments.ts:62-63 mapped this to `page_id` field; the V1
 *     handler then silently dropped it because Notion's public API
 *     does not support block-level comments. V2 rejects at schema time
 *     to surface the limitation loudly.
 *   - `workspace` selector. Resolved via triggerEvent.accountId.
 */
export const CreateCommentConfigSchema = z
  .object({
    pageId: z.string().min(1).optional(),
    discussionId: z.string().min(1).optional(),
    text: z.string().min(1, "text is required."),
  })
  .strict()
  .refine(
    (v) =>
      (v.pageId !== undefined && v.discussionId === undefined) ||
      (v.pageId === undefined && v.discussionId !== undefined),
    {
      message:
        "create_comment requires exactly one of pageId or discussionId (not both, not neither).",
    },
  );

export type CreateCommentConfig = z.infer<typeof CreateCommentConfigSchema>;
