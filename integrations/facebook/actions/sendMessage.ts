import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { messagesSend } from "@/integrations/_shared/facebook/api/messagesSend";
import { SendMessageConfigSchema } from "./sendMessage.schema";

/**
 * Facebook `send_message` — Slice 3.FACEBOOK-2. Sends a Messenger message
 * AS the Page (`messaging_type: RESPONSE`). `recipientId` may be a raw PSID
 * or the `conversationId:psid` form V1's conversation picker produced — the
 * PSID is extracted here.
 *
 * Medium risk. **Messenger Platform review** is a distinct, stricter GA
 * gate than Pages review (D-FB7) — surfaced in the FACEBOOK-4 metadata
 * description. Output: `{ messageId, recipientId }`.
 */
export const sendMessage: ActionHandler = async (input) => {
  const config = SendMessageConfigSchema.parse(input.config);

  // V1's conversation picker yields "conversationId:psid"; extract the PSID.
  const psid = config.recipientId.includes(":")
    ? (config.recipientId.split(":")[1] ?? config.recipientId)
    : config.recipientId;

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
      return messagesSend({
        pageAccessToken,
        pageId: config.pageId,
        recipientId: psid,
        text: config.message,
      });
    },
  });

  return {
    output: {
      messageId: result.message_id ?? null,
      recipientId: result.recipient_id ?? psid,
      pageId: config.pageId,
    },
  };
};
