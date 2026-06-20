import { z } from "zod";

/**
 * Resolved-config schema for the Teams `list_channels` action
 * (Slice 4.TEAMS-READ-2).
 *
 * Lists the channels of a single team. `teamId` is required; the
 * `channelsList` wrapper applies a fixed
 * `$select=id,displayName,description,membershipType` (deliberately omits the
 * channel `email`). `.strict()` rejects stray fields.
 *
 * Read-only, metadata-only: returns channel metadata — never message content.
 */
export const ListChannelsConfigSchema = z
  .object({
    teamId: z.string().min(1, "teamId is required."),
  })
  .strict();

export type ListChannelsConfig = z.infer<typeof ListChannelsConfigSchema>;
