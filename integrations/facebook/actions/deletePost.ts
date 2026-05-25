import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { postsDelete } from "@/integrations/_shared/facebook/api/postsDelete";
import { DeletePostConfigSchema } from "./deletePost.schema";

/**
 * Facebook `delete_post` — Slice 3.FACEBOOK-2. High-risk / destructive —
 * Graph `DELETE` is PERMANENT (no restore). Output is STRUCTURAL ONLY —
 * the deleted post's text / media are never fetched or echoed (parity with
 * `dropbox:delete_file` / `monday:delete_item`). The destructive trio
 * (high + isDestructive + requiresConfirmation) lands in the FACEBOOK-4
 * metadata.
 *
 * Output: `{ success, deletedPostId, deletedAt }`.
 */
export const deletePost: ActionHandler = async (input) => {
  const config = DeletePostConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.accountId
      : null;

  await refreshAndRetry({
    userId: input.userId,
    provider: "facebook",
    accountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return postsDelete({ pageAccessToken, postId: config.postId });
    },
  });

  return {
    output: {
      success: true,
      deletedPostId: config.postId,
      deletedAt: new Date().toISOString(),
    },
  };
};
