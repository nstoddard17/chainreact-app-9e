import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildBlocks } from "@/integrations/_shared/notion/blocks";
import { blocksAppendChildren } from "../api/blocks";
import { AppendBlockChildrenConfigSchema } from "./appendBlockChildren.schema";

/**
 * Notion `append_block_children` action handler.
 *
 * Appends a typed list of block specs as children of an existing block
 * or page. The discriminated `BlockSpec` union covers Slice 9 Batch 1's
 * 9 supported block types; unsupported types fail the schema BEFORE
 * the wrapper executes.
 *
 * Output shape (downstream variable refs):
 *   { childIds, count }
 *   - `childIds` is `string[]` of newly-created block ids.
 *   - `count` is the number of blocks created.
 *   The full block payloads are not echoed — they're only marginally
 *   useful downstream and bloat the engine run record.
 */
export const appendBlockChildren: ActionHandler = async (input) => {
  const config = AppendBlockChildrenConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  // Coerce typed BlockSpec[] into Notion wire-format children.
  const wireChildren = buildBlocks(config.children);

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      blocksAppendChildren({
        accessToken,
        blockId: config.blockId,
        children: wireChildren,
      }),
  });

  return {
    output: {
      childIds: result.results.map((r) => r.id),
      count: result.results.length,
    },
  };
};
