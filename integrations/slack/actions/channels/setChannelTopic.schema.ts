import { z } from "zod";

/**
 * Resolved-config schema for the Slack set_channel_topic action.
 *
 * `topic` is allowed to be an empty string (clears the topic). Slack
 * stores the value verbatim subject to its own 250-char truncation.
 */
export const SetChannelTopicConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
    topic: z.string().max(250, "topic must be 250 characters or fewer."),
  })
  .strict();
export type SetChannelTopicConfig = z.infer<typeof SetChannelTopicConfigSchema>;
