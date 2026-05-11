import { z } from "zod";

/**
 * Resolved-config schema for the Teams get_channel_details action.
 *
 * Read-only. Returns the channel resource for the (teamId, channelId)
 * pair.
 */
export const GetChannelDetailsConfigSchema = z
  .object({
    teamId: z.string().min(1),
    channelId: z.string().min(1),
  })
  .strict();

export type GetChannelDetailsConfig = z.infer<
  typeof GetChannelDetailsConfigSchema
>;
