import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { commentsCreate } from "@/integrations/_shared/facebook/api/commentsCreate";
import { CommentOnPostConfigSchema } from "./commentOnPost.schema";

/**
 * Facebook `comment_on_post` — Slice 3.FACEBOOK-2. Adds a comment as the
 * Page to a post. Medium risk (public engagement).
 *
 * Output: `{ commentId, postId }`.
 */
export const commentOnPost: ActionHandler = async (input) => {
  const config = CommentOnPostConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "facebook",
    providerAccountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return commentsCreate({
        pageAccessToken,
        postId: config.postId,
        message: config.comment,
        ...(config.attachmentUrl !== undefined && { attachmentUrl: config.attachmentUrl }),
      });
    },
  });

  return {
    output: {
      commentId: result.id,
      postId: config.postId,
      pageId: config.pageId,
    },
  };
};
