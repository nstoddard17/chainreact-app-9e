import { z } from "zod";

/**
 * Zod schema for the Teams `new_channel_message` subscription trigger
 * config.
 *
 * Two required user fields (`teamId`, `channelId`) — the trigger is
 * scoped to a specific channel because Microsoft Graph subscriptions
 * on `/teams/{teamId}/channels/{channelId}/messages` require both.
 *
 * Lifecycle-managed fields (`type`, `webhookEnabled`, `resource`,
 * `changeType`, `subscriptionId`, `clientState`, `expiresAt`) are
 * stamped by the activation hook and updated by the renewal handler
 * — they survive renewals untouched. They appear here so the schema
 * round-trips trigger_resources.config losslessly.
 *
 * No optional V1 filter fields in Batch 1 — slice 16 plan §
 * "Trigger surface deferred". Filters (`new_reply`, `channel_mention`,
 * etc.) come back in Batch 2.
 */
export const NewChannelMessageConfigSchema = z.object({
  teamId: z.string().min(1),
  channelId: z.string().min(1),

  // Lifecycle-managed (populated by activate hook):
  type: z.literal("subscription-watch").optional(),
  webhookEnabled: z.boolean().optional(),
  resource: z.string().min(1).optional(),
  changeType: z.literal("created").optional(),
  subscriptionId: z.string().min(1).optional(),
  clientState: z.string().min(64).optional(),
  expiresAt: z.string().min(1).optional(),
});

export type NewChannelMessageConfig = z.infer<
  typeof NewChannelMessageConfigSchema
>;
