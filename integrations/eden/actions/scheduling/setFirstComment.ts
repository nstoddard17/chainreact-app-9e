import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { setFirstComment } from "@/integrations/_shared/eden/api/scheduling";
import { SetFirstCommentConfigSchema } from "./setFirstComment.schema";

/** `eden:set_first_comment` — set or clear the auto first-comment on a post (reversible). */
export const edenSetFirstComment: ActionHandler = async (input) => {
  const config = SetFirstCommentConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      setFirstComment({
        accessToken,
        postId: config.postId,
        comment: config.comment,
        ...(config.afterLikes !== undefined ? { afterLikes: config.afterLikes } : {}),
        ...(config.delayMinutes !== undefined ? { delayMinutes: config.delayMinutes } : {}),
      }),
  });
  return {
    output: {
      postId: result.postId,
      status: result.status,
      hasFirstComment: result.hasFirstComment,
    },
  };
};
