import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsUpdate } from "../api/cards";
import { UpdateCardConfigSchema } from "./updateCard.schema";

/**
 * Trello `update_card` action handler — Slice 17 Commit 4.
 *
 * PUTs `/1/cards/{cardId}`. Only fields the workflow explicitly set are
 * forwarded — empty updates rejected at the schema layer (Q11 — fail
 * loud on no-op payloads).
 *
 * Output: same shape as `create_card` for downstream variable
 * compatibility, sourced from Trello's PUT response.
 */
export const updateCard: ActionHandler = async (input) => {
  const config = UpdateCardConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". Pass accountId: null
  // — see createCard.ts for rationale.
  const card = await refreshAndRetry({
    userId: input.userId,
    provider: "trello",
    accountId: null,
    apiCall: (accessToken) =>
      cardsUpdate({
        accessToken,
        cardId: config.cardId,
        name: config.name,
        desc: config.desc,
        idList: config.idList,
        pos: config.pos,
        due: config.due,
        dueComplete: config.dueComplete,
        start: config.start,
        closed: config.closed,
      }),
  });

  return {
    output: {
      cardId: card.id,
      name: card.name,
      url: card.url ?? null,
      shortUrl: card.shortUrl ?? null,
      idList: card.idList ?? null,
      idBoard: card.idBoard ?? null,
      desc: card.desc ?? null,
      due: card.due ?? null,
      dueComplete: card.dueComplete ?? null,
      start: card.start ?? null,
      closed: card.closed ?? null,
      idMembers: card.idMembers ?? [],
      idLabels: card.idLabels ?? [],
      pos: card.pos ?? null,
    },
  };
};
