import { z } from "zod";

/**
 * Resolved-config schema for the Teams reply_to_channel_message action.
 *
 * Posts a reply to a parent message in a channel. The parent message
 * id is the conversation thread anchor — Graph stores replies as
 * separate chatMessage resources with `replyToId` pointing back.
 *
 * `contentType` defaults to `'html'` (uniform with send_channel_message
 * / send_chat_message). V1's reply handler omitted contentType and
 * relied on Graph's plain-text default — V2 normalizes for
 * cross-action consistency.
 */
export const ReplyToChannelMessageConfigSchema = z
  .object({
    teamId: z.string().min(1),
    channelId: z.string().min(1),
    messageId: z.string().min(1),
    content: z.string().min(1),
    contentType: z.enum(["text", "html"]).default("html"),
  })
  .strict();

export type ReplyToChannelMessageConfig = z.infer<
  typeof ReplyToChannelMessageConfigSchema
>;
