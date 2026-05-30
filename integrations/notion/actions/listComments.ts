import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { commentsList } from "../api/comments";
import { mapNotionComment } from "./createComment";
import { ListCommentsConfigSchema } from "./listComments.schema";

/**
 * Notion `list_comments` action handler (Notion 2.1 Commit 3).
 *
 * Lists comments on the named block (or page) via
 * `GET /v1/comments?block_id=<id>`. Single-page result — no
 * auto-pagination. Workflow authors that need to walk all pages
 * compose a downstream loop on `nextCursor` + `hasMore`.
 *
 * Each comment mapped via the same `mapNotionComment` helper as
 * `create_comment` so single and list outputs are shape-consistent.
 *
 * Output:
 *   { comments: [...], nextCursor, hasMore }
 */
export const listComments: ActionHandler = async (input) => {
  const config = ListCommentsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      commentsList({
        accessToken,
        blockId: config.blockId,
        pageSize: config.pageSize,
        startCursor: config.startCursor,
      }),
  });

  return {
    output: {
      comments: result.results.map(mapNotionComment),
      nextCursor: result.next_cursor,
      hasMore: result.has_more,
    },
  };
};
