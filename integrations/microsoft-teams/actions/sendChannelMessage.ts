import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelMessageSend } from "../api/channelMessageSend";
import { SendChannelMessageConfigSchema } from "./sendChannelMessage.schema";
import { normalizeChatMessage } from "./_normalize";

/**
 * Teams `send_channel_message` action handler.
 *
 * Posts a message to a Teams channel. Output is normalized via the
 * shared `normalizeChatMessage` helper so the variable contract is
 * identical across send_channel / reply / send_chat outputs (only the
 * `channelId` vs `chatId` membership differs).
 */
export const sendChannelMessage: ActionHandler = async (input) => {
  const config = SendChannelMessageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const message = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      channelMessageSend({
        accessToken,
        teamId: config.teamId,
        channelId: config.channelId,
        contentType: config.contentType,
        content: config.content,
      }),
  });

  return {
    output: {
      ...normalizeChatMessage(message),
      teamId: config.teamId,
      channelId: config.channelId,
    },
  };
};
