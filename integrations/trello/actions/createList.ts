import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listsCreate } from "../api/lists";
import { CreateListConfigSchema } from "./createList.schema";

/**
 * Trello `create_list` action handler — Slice 17 Commit 4.
 *
 * POST /1/lists. Required: idBoard + name. Optional: pos.
 *
 * Output: identifying fields useful for chained `create_card` calls —
 * `{{nodeId.listId}}` becomes the typical reference.
 */
export const createList: ActionHandler = async (input) => {
  const config = CreateListConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". See createCard.ts.
  const list = await refreshAndRetry({
    userId: input.userId,
    provider: "trello",
    accountId: null,
    apiCall: (accessToken) =>
      listsCreate({
        accessToken,
        idBoard: config.idBoard,
        name: config.name,
        pos: config.pos,
      }),
  });

  return {
    output: {
      listId: list.id,
      name: list.name,
      idBoard: list.idBoard,
      pos: list.pos ?? null,
      closed: list.closed ?? null,
    },
  };
};
