import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { blocksChildrenList } from "../api/blocks";
import { mapNotionBlock } from "./getBlock";
import { GetBlockChildrenConfigSchema } from "./getBlockChildren.schema";

/**
 * Notion `get_block_children` action handler (Notion 2.1 Commit 4).
 *
 * Sends `GET /v1/blocks/{block_id}/children` and returns a single page
 * of child blocks. No auto-pagination — workflow authors compose a
 * downstream loop on `nextCursor` + `hasMore`.
 *
 * Each block mapped via the same `mapNotionBlock` helper as
 * `get_block` so single and list outputs are shape-consistent.
 *
 * Output shape:
 *   {
 *     blocks: [...mapped blocks...],
 *     nextCursor,            // string | null
 *     hasMore,
 *   }
 */
export const getBlockChildren: ActionHandler = async (input) => {
  const config = GetBlockChildrenConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      blocksChildrenList({
        accessToken,
        blockId: config.blockId,
        pageSize: config.pageSize,
        startCursor: config.startCursor,
      }),
  });

  return {
    output: {
      blocks: result.results.map(mapNotionBlock),
      nextCursor: result.next_cursor,
      hasMore: result.has_more,
    },
  };
};
