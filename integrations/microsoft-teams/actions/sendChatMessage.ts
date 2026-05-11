import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { chatMessageSend } from "../api/chatMessageSend";
import { SendChatMessageConfigSchema } from "./sendChatMessage.schema";
import { normalizeChatMessage } from "./_normalize";

/**
 * Teams `send_chat_message` action handler.
 *
 * Sends a message to an existing Teams chat. Output uses the shared
 * normalize helper plus `chatId` membership context.
 */
export const sendChatMessage: ActionHandler = async (input) => {
  const config = SendChatMessageConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.accountId
      : null;

  const message = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-teams",
    accountId,
    apiCall: (accessToken) =>
      chatMessageSend({
        accessToken,
        chatId: config.chatId,
        contentType: config.contentType,
        content: config.content,
      }),
  });

  return {
    output: {
      ...normalizeChatMessage(message),
      chatId: config.chatId,
    },
  };
};
