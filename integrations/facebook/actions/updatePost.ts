import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { postsUpdate } from "@/integrations/_shared/facebook/api/postsUpdate";
import { UpdatePostConfigSchema } from "./updatePost.schema";

/**
 * Facebook `update_post` — Slice 3.FACEBOOK-2. Edits a published Page
 * post's message (and optionally its publish state). Medium risk.
 *
 * Output: `{ postId, success }`.
 */
export const updatePost: ActionHandler = async (input) => {
  const config = UpdatePostConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "facebook",
    accountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return postsUpdate({
        pageAccessToken,
        postId: config.postId,
        message: config.message,
        ...(config.isPublished !== undefined && { isPublished: config.isPublished }),
      });
    },
  });

  return {
    output: {
      postId: config.postId,
      pageId: config.pageId,
      success: result.success ?? true,
    },
  };
};
