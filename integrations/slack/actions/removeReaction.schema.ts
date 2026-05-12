import { z } from "zod";

/**
 * Resolved-config schema for the Slack remove_reaction action.
 *
 * Same shape as add_reaction. V2 ships the direct Slack-native
 * "remove a specific reaction" semantic — NOT V1's custom "remove
 * ALL reactions this bot added" bulk operation.
 */
export const RemoveReactionConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
  reaction: z.string().min(1, "Reaction emoji name is required."),
});
export type RemoveReactionConfig = z.infer<typeof RemoveReactionConfigSchema>;
