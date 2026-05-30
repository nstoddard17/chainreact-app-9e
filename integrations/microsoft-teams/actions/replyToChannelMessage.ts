import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { channelMessageReply } from "../api/channelMessageReply";
import { ReplyToChannelMessageConfigSchema } from "./replyToChannelMessage.schema";
import { normalizeChatMessage } from "./_normalize";

/**
 * Teams `reply_to_channel_message` action handler.
 *
 * Posts a reply to a parent channel message. Output uses the shared
 * normalize helper plus `teamId` / `channelId` / `parentMessageId`
 * context so downstream nodes can thread or audit.
 */
export const replyToChannelMessage: ActionHandler = async (input) => {
  const config = ReplyToChannelMessageConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-teams"
      ? input.triggerEvent.providerAccountId
      : null;

  const message = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-teams",
    providerAccountId,
    apiCall: (accessToken) =>
      channelMessageReply({
        accessToken,
        teamId: config.teamId,
        channelId: config.channelId,
        messageId: config.messageId,
        contentType: config.contentType,
        content: config.content,
      }),
  });

  return {
    output: {
      ...normalizeChatMessage(message),
      teamId: config.teamId,
      channelId: config.channelId,
      parentMessageId: config.messageId,
    },
  };
};
