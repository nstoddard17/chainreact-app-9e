import { notionRequest } from "./_request";

/**
 * Notion Comments API wrappers — Notion 2.1 Commit 3.
 *
 * Two endpoints:
 *   - `commentsCreate` — POST /v1/comments
 *   - `commentsList` — GET /v1/comments?block_id=<id>
 *
 * Used by:
 *   - `actions/createComment.ts` → `commentsCreate`
 *   - `actions/listComments.ts` → `commentsList`
 *
 * Notion's comments model:
 *   - A "comment" is created against either a page parent
 *     (`parent: { page_id }`) OR an existing discussion thread
 *     (`discussion_id`). Mutually exclusive — Notion rejects requests
 *     that supply both or neither.
 *   - Notion's public API does NOT support block-level comments today.
 *     V1's `manageComments.ts` plumbed a third "block" target, but the
 *     handler at `handlers.ts:1297-1301` silently dropped it because
 *     Notion would 400 anyway. V2 does NOT carry that confusion.
 *   - Listing comments uses GET `/v1/comments?block_id=<id>` — Notion's
 *     parameter name is `block_id` but in practice it accepts page ids
 *     too (pages are blocks at the API level). Mirrors the
 *     `appendBlockChildren` precedent of using `blockId` as the V2
 *     field name with a "pages accepted too" note.
 *
 * All wrappers route through `notionRequest` so 401 / 404 mapping +
 * Notion-Version pin + `NOTION_API_BASE` override live in one place.
 */

// ─── Shared shapes ────────────────────────────────────────────────────────

/**
 * Notion's rich-text segment shape. Subset — only fields V2 reads on
 * comment responses. Outbound, we only emit `{ type: "text", text: { content } }`.
 */
export interface NotionRichTextSegment {
  type?: "text" | "mention" | "equation";
  plain_text?: string;
  text?: { content?: string; link?: { url: string } | null };
  href?: string | null;
}

/**
 * Notion's comment response shape. Subset — only fields V2 reads.
 *
 * `parent` is discriminated by `parent.type`:
 *   - `{ type: "page_id", page_id: "..." }` — comment on a page.
 *   - `{ type: "block_id", block_id: "..." }` — comment on a block.
 *
 * `discussion_id` is ALWAYS present on every comment response (Notion
 * groups every comment into a discussion thread, even single-comment
 * ones). The `discussion_id` is what callers use to add follow-up
 * comments to the same thread.
 */
export interface NotionComment {
  object: "comment";
  id: string;
  parent?: {
    type?: "page_id" | "block_id";
    page_id?: string;
    block_id?: string;
  };
  discussion_id?: string;
  rich_text?: ReadonlyArray<NotionRichTextSegment>;
  created_time?: string;
  last_edited_time?: string;
  created_by?: { object?: "user"; id?: string };
}

// ─── commentsCreate ──────────────────────────────────────────────────────

/**
 * Discriminated input for `commentsCreate`. Either `pageId` (creates a
 * new discussion on the page) OR `discussionId` (adds a comment to an
 * existing thread). Schema enforces exactly one — wrapper assumes the
 * caller already validated.
 */
export type CommentsCreateTarget =
  | { pageId: string; discussionId?: undefined }
  | { discussionId: string; pageId?: undefined };

export interface CommentsCreateInput {
  accessToken: string;
  target: CommentsCreateTarget;
  /**
   * Plain-text comment body. Wrapper synthesizes the rich_text array:
   *   [{ type: "text", text: { content: text } }]
   * V2 does not accept raw rich_text JSON passthrough — schema-strict
   * per the audit / V2 conventions.
   */
  text: string;
}

export async function commentsCreate(
  input: CommentsCreateInput,
): Promise<NotionComment> {
  const body: Record<string, unknown> = {
    rich_text: [{ type: "text", text: { content: input.text } }],
  };
  if (input.target.pageId !== undefined) {
    body.parent = { page_id: input.target.pageId };
  } else {
    body.discussion_id = input.target.discussionId;
  }

  return notionRequest<NotionComment>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/comments",
    body,
    resourceForNotFound:
      input.target.pageId !== undefined
        ? `page ${input.target.pageId}`
        : `discussion ${input.target.discussionId}`,
  });
}

// ─── commentsList ────────────────────────────────────────────────────────

export interface CommentsListResponse {
  object: "list";
  results: NotionComment[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface CommentsListInput {
  accessToken: string;
  /**
   * Notion's parameter name is `block_id`; in practice it accepts page
   * ids too (pages are blocks at the API level). Matches the V2
   * `appendBlockChildren` convention.
   */
  blockId: string;
  /** Optional — 1..100 per Notion's hard ceiling. Schema enforces. */
  pageSize?: number;
  /** Optional pagination cursor from a prior response. */
  startCursor?: string;
}

export async function commentsList(
  input: CommentsListInput,
): Promise<CommentsListResponse> {
  const params = new URLSearchParams();
  params.set("block_id", input.blockId);
  if (input.pageSize !== undefined) {
    params.set("page_size", String(input.pageSize));
  }
  if (input.startCursor !== undefined) {
    params.set("start_cursor", input.startCursor);
  }
  return notionRequest<CommentsListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/comments?${params.toString()}`,
    resourceForNotFound: `comments for ${input.blockId}`,
  });
}
