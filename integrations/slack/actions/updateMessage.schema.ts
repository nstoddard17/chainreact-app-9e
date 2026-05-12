import { z } from "zod";

/**
 * Resolved-config schema for the Slack update_message action.
 *
 * Updates an existing message's text in place via `chat.update`. The
 * message is identified by `(channel, ts)` — the same pair returned
 * by send_channel_message / send_direct_message.
 *
 * Slack 2.1 ports the bot-token path only; messages posted by users
 * cannot be edited by the bot. V1's fallback-to-user-token logic is
 * deferred (P-S1 user-token storage).
 */
export const UpdateMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
  text: z.string().min(1, "New message text is required."),
});
export type UpdateMessageConfig = z.infer<typeof UpdateMessageConfigSchema>;
