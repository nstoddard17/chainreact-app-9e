import { z } from "zod";

/**
 * Resolved-config schema for the Slack archive_channel action
 * (Slack 2.3 Commit 3). Channel id only (`^[CG][A-Z0-9]+$`); no
 * silent name resolution.
 */
export const ArchiveChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
  })
  .strict();
export type ArchiveChannelConfig = z.infer<typeof ArchiveChannelConfigSchema>;
