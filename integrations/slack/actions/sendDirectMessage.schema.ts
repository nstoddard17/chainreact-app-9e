import { z } from "zod";

/**
 * Resolved-config schema for the Slack send_direct_message action.
 *
 * Posts a DM from the bot to a Slack user. The handler resolves the DM
 * channel via `conversations.open(users: userId)` then `chat.postMessage`.
 *
 * `userId` is the Slack user id (`U…`). Slack 2.1's send_direct_message
 * supports only 1:1 DMs — group DMs / mpim are out of scope.
 *
 * `threadTs` (optional): post as a thread reply within the DM channel,
 * symmetric to send_channel_message.
 */
export const SendDirectMessageConfigSchema = z.object({
  userId: z
    .string()
    .min(1, "Slack user id is required.")
    .regex(/^U[A-Z0-9]+$/, "Slack user id must start with U."),
  text: z.string().min(1, "Message text is required."),
  threadTs: z.string().min(1).optional(),
});
export type SendDirectMessageConfig = z.infer<typeof SendDirectMessageConfigSchema>;
