import { z } from "zod";

/**
 * Resolved-config schema for the Slack delete_message action.
 *
 * Deletes the message identified by `(channel, ts)` via `chat.delete`.
 * Bot can only delete messages it posted unless granted workspace-admin
 * scopes. Caller sees `cant_delete_message` from Slack when the bot
 * lacks permission.
 *
 * V1's separate `channelType: 'dm'` code path is intentionally NOT
 * ported — V2 expects the caller to pass the DM channel id directly
 * (it's the same return value as send_direct_message.output.channel).
 */
export const DeleteMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
});
export type DeleteMessageConfig = z.infer<typeof DeleteMessageConfigSchema>;
