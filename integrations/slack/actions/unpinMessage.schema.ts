import { z } from "zod";

/**
 * Resolved-config schema for the Slack unpin_message action.
 * Same shape as pin_message.
 */
export const UnpinMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
});
export type UnpinMessageConfig = z.infer<typeof UnpinMessageConfigSchema>;
