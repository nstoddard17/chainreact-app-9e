import { z } from "zod";

/**
 * Resolved-config schema for `facebook:send_message` — Slice 3.FACEBOOK-2.
 * Sends a Messenger message AS the Page. `recipientId` is the recipient
 * PSID; a `conversationId:psid` value (V1's conversation-picker format) is
 * accepted and the PSID is extracted in the handler. `messaging_type:
 * RESPONSE` — replying within an open conversation (the Dev-Mode-testable
 * case; broader messaging needs Messenger Platform review — D-FB7).
 */
export const SendMessageConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    recipientId: z.string().min(1, "recipientId is required."),
    message: z.string().min(1, "message is required."),
  })
  .strict();

export type SendMessageConfig = z.infer<typeof SendMessageConfigSchema>;
