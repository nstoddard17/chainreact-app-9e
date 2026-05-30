import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsUpdate } from "../api/cards";
import { ArchiveCardConfigSchema } from "./archiveCard.schema";

/**
 * Trello `archive_card` action handler — Slice 17 Commit 4.
 *
 * PUT /1/cards/{cardId} with `closed: true` (archive) or `closed: false`
 * (unarchive). Schema defaults to `closed: true` because the action's
 * name unambiguously implies archiving — not a Q11 hidden default.
 *
 * Output: card identifying fields + the new `closed` state for
 * downstream branching (e.g. notify-after-archive workflows).
 */
export const archiveCard: ActionHandler = async (input) => {
  const config = ArchiveCardConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". See createCard.ts.
  const card = await refreshAndRetry({
    accountId: input.accountId,
    provider: "trello",
    providerAccountId: null,
    apiCall: (accessToken) =>
      cardsUpdate({
        accessToken,
        cardId: config.cardId,
        closed: config.closed,
      }),
  });

  return {
    output: {
      cardId: card.id,
      name: card.name,
      closed: card.closed ?? null,
      url: card.url ?? null,
    },
  };
};
