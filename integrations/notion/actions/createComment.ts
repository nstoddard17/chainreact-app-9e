import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  commentsCreate,
  type NotionComment,
  type NotionRichTextSegment,
} from "../api/comments";
import { CreateCommentConfigSchema } from "./createComment.schema";

/**
 * Notion `create_comment` action handler (Notion 2.1 Commit 3).
 *
 * Sends `POST /v1/comments` with one of:
 *   - `{ parent: { page_id }, rich_text }` — new discussion on a page
 *   - `{ discussion_id, rich_text }` — reply to an existing thread
 *
 * Schema guarantees exactly one target is set; handler picks the right
 * wrapper input.
 *
 * Output shape (key set locked by test):
 *   {
 *     commentId,
 *     object,
 *     parentType,        // "page_id" | "block_id" | null
 *     parentId,          // string | null  — populated when parent.type=page_id
 *     parentBlockId,     // string | null  — populated when parent.type=block_id
 *     discussionId,      // string | null  — always present on Notion responses
 *     plainText,         // string — concatenated plain_text from rich_text array
 *     createdTime,
 *     lastEditedTime,
 *     createdByUserId,
 *   }
 *
 * No input spreading into output.
 */
export const createComment: ActionHandler = async (input) => {
  const config = CreateCommentConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const target =
    config.pageId !== undefined
      ? ({ pageId: config.pageId } as const)
      : ({ discussionId: config.discussionId! } as const);

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      commentsCreate({
        accessToken,
        target,
        text: config.text,
      }),
  });

  return {
    output: mapNotionComment(result),
  };
};

/**
 * Map a Notion comment response into V2's stable flat output shape.
 * Reused by `list_comments` so single + list outputs match exactly.
 */
export function mapNotionComment(
  c: NotionComment,
): Readonly<Record<string, unknown>> {
  return {
    commentId: c.id,
    object: c.object,
    parentType: c.parent?.type ?? null,
    parentId: c.parent?.page_id ?? null,
    parentBlockId: c.parent?.block_id ?? null,
    discussionId: c.discussion_id ?? null,
    plainText: extractPlainText(c.rich_text),
    createdTime: c.created_time ?? null,
    lastEditedTime: c.last_edited_time ?? null,
    createdByUserId: c.created_by?.id ?? null,
  };
}

function extractPlainText(
  segments: ReadonlyArray<NotionRichTextSegment> | undefined,
): string {
  if (!segments) return "";
  return segments
    .map((s) => s.plain_text ?? s.text?.content ?? "")
    .join("");
}
