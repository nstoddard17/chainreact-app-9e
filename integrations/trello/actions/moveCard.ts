import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsUpdate } from "../api/cards";
import { MoveCardConfigSchema } from "./moveCard.schema";

/**
 * Trello `move_card` action handler — Slice 17 Commit 4.
 *
 * Implemented as a targeted PUT /1/cards/{cardId} that sets `idList`
 * (and optionally `pos`). Reuses `cardsUpdate` rather than introducing
 * a dedicated wrapper because Trello does NOT expose a separate "move"
 * endpoint — moving is just updating `idList`.
 *
 * Output shape — useful for downstream chains that need both the new
 * list AND the card's position post-move.
 */
export const moveCard: ActionHandler = async (input) => {
  const config = MoveCardConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". See createCard.ts.
  const card = await refreshAndRetry({
    accountId: input.accountId,
    provider: "trello",
    providerAccountId: null,
    apiCall: (accessToken) =>
      cardsUpdate({
        accessToken,
        cardId: config.cardId,
        idList: config.idList,
        pos: config.pos,
      }),
  });

  return {
    output: {
      cardId: card.id,
      name: card.name,
      idList: card.idList ?? null,
      idBoard: card.idBoard ?? null,
      pos: card.pos ?? null,
      url: card.url ?? null,
    },
  };
};
