import { z } from "zod";

/**
 * Resolved-config schema for the Slack get_channel_info action
 * (Slack 2.3 Commit 2).
 *
 * Reads a single channel object by id via `conversations.info`.
 *
 * `channel` is a Slack channel id of shape `^[CDG][A-Z0-9]+$`. Public
 * channels are C-prefixed; private channels are C-prefixed (modern)
 * or G-prefixed (legacy); DMs are D-prefixed; mpim group DMs share
 * the G prefix with legacy private channels. The handler does not
 * resolve channel names to ids — Slack 2.3 contract is id-only (see
 * the Slack 2.3 plan §5.1 + §6 decision 2).
 *
 * `.strict()` rejects unknown keys — typo / drift defense per the
 * established Slack 2.1 schema pattern.
 */
export const GetChannelInfoConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CDG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C…, D…, or G…).",
      ),
  })
  .strict();
export type GetChannelInfoConfig = z.infer<typeof GetChannelInfoConfigSchema>;
