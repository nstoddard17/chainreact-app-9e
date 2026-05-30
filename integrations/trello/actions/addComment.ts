import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { cardsAddComment } from "../api/cards";
import { AddCommentConfigSchema } from "./addComment.schema";

/**
 * Trello `add_comment` action handler — Slice 17 Commit 4.
 *
 * POST /1/cards/{cardId}/actions/comments with `{ text }`.
 *
 * Output: comment identifying fields. The `commentId` is the Trello
 * action id — useful for downstream chains that need to reference
 * the comment later (e.g., notify channel about the comment).
 */
export const addComment: ActionHandler = async (input) => {
  const config = AddCommentConfigSchema.parse(input.config);

  // Trello integrations are tokenScope: "user". See createCard.ts.
  const action = await refreshAndRetry({
    accountId: input.accountId,
    provider: "trello",
    providerAccountId: null,
    apiCall: (accessToken) =>
      cardsAddComment({
        accessToken,
        cardId: config.cardId,
        text: config.text,
      }),
  });

  return {
    output: {
      commentId: action.id,
      text: action.data?.text ?? config.text,
      date: action.date ?? null,
      memberCreatorId: action.memberCreator?.id ?? null,
      memberCreatorUsername: action.memberCreator?.username ?? null,
      memberCreatorFullName: action.memberCreator?.fullName ?? null,
    },
  };
};
