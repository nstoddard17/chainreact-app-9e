import { z } from "zod";

/**
 * Resolved-config schema for the Slack pin_message action.
 *
 * Identifies a message via `(channel, ts)` — same identifier shape
 * as add_reaction / update_message / delete_message.
 */
export const PinMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
});
export type PinMessageConfig = z.infer<typeof PinMessageConfigSchema>;
