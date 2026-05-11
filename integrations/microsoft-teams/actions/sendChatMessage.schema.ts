import { z } from "zod";

/**
 * Resolved-config schema for the Teams send_chat_message action.
 *
 * Sends to an existing chat. Chat creation is deferred to Batch 2
 * (requires Chat.Create + admin consent). Caller supplies the chatId
 * resolved out-of-band.
 *
 * `contentType` defaults to `'html'` matching the send_channel_message
 * default for cross-action consistency.
 */
export const SendChatMessageConfigSchema = z
  .object({
    chatId: z.string().min(1),
    content: z.string().min(1),
    contentType: z.enum(["text", "html"]).default("html"),
  })
  .strict();

export type SendChatMessageConfig = z.infer<
  typeof SendChatMessageConfigSchema
>;
