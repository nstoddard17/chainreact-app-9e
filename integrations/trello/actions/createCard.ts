import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsCreate } from "../api/cards";
import { CreateCardConfigSchema } from "./createCard.schema";

/**
 * Trello `create_card` action handler — Slice 17 Commit 4.
 *
 * POSTs `/1/cards` with the user's Trello token. Wraps the principal
 * call in `refreshAndRetry` so 401s surface as
 * `IntegrationActionRequiredError(reason: "refresh_not_supported")` —
 * Trello is non-refreshable per Slice 17 Commit 3 manifest.
 *
 * Output shape (downstream variable refs):
 *   { cardId, name, url, shortUrl, idList, idBoard, desc, due,
 *     dueComplete, start, closed, idMembers, idLabels, pos }
 *
 *   Stable for `update_card` / `move_card` / `add_comment` chains —
 *   `{{nodeId.cardId}}` is the typical reference.
 */
export const createCard: ActionHandler = async (input) => {
  const config = CreateCardConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user" — one row per
  // (userId, member id). The TriggerEvent.accountId carries the
  // *board* id (event scope) for downstream variable resolution, NOT
  // the integration account id. Pass null so getActiveForExecution
  // returns the first active Trello row for this user.
  const card = await refreshAndRetry({
    accountId: input.accountId,
    provider: "trello",
    providerAccountId: null,
    apiCall: (accessToken) =>
      cardsCreate({
        accessToken,
        idList: config.listId,
        name: config.name,
        desc: config.desc,
        pos: config.pos,
        due: config.due,
        dueComplete: config.dueComplete,
        start: config.start,
        idMembers: config.idMembers,
        idLabels: config.idLabels,
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
