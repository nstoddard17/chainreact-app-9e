import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { postsCreate } from "@/integrations/_shared/facebook/api/postsCreate";
import { CreatePostConfigSchema } from "./createPost.schema";

/**
 * Facebook `create_post` — Slice 3.FACEBOOK-2. Publishes a text/link Page
 * post (optionally scheduled). Derives the Page token at runtime from the
 * user token, then `POST /{pageId}/feed`. Medium risk (public publishing).
 *
 * Output: `{ postId }` (+ `scheduledPublishTime` echo when scheduled).
 */
export const createPost: ActionHandler = async (input) => {
  const config = CreatePostConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.providerAccountId
      : null;

  const scheduledUnix =
    config.scheduledPublishTime !== undefined
      ? Math.floor(new Date(config.scheduledPublishTime).getTime() / 1000)
      : undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "facebook",
    providerAccountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return postsCreate({
        pageAccessToken,
        pageId: config.pageId,
        message: config.message,
        ...(config.link !== undefined && { link: config.link }),
        ...(scheduledUnix !== undefined && { scheduledPublishTime: scheduledUnix }),
      });
    },
  });

  return {
    output: {
      postId: result.id,
      pageId: config.pageId,
      scheduledPublishTime: config.scheduledPublishTime ?? null,
    },
  };
};
