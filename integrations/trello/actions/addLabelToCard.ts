import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsAddLabel } from "../api/cards";
import { AddLabelToCardConfigSchema } from "./addLabelToCard.schema";

/**
 * Trello `add_label_to_card` action handler — Slice 17 Commit 4.
 *
 * POST /1/cards/{cardId}/idLabels?value={labelId}. Trello's response is
 * the updated array of label ids on the card; V2 surfaces this as
 * `idLabels` for downstream branching.
 *
 * Output:
 *   { cardId, idLabels } — `idLabels` is the post-mutation full list,
 *   so workflows can diff to confirm the add succeeded.
 */
export const addLabelToCard: ActionHandler = async (input) => {
  const config = AddLabelToCardConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". See createCard.ts.
  const idLabels = await refreshAndRetry({
    userId: input.userId,
    provider: "trello",
    accountId: null,
    apiCall: (accessToken) =>
      cardsAddLabel({
        accessToken,
        cardId: config.cardId,
        labelId: config.labelId,
      }),
  });

  return {
    output: {
      cardId: config.cardId,
      idLabels,
    },
  };
};
