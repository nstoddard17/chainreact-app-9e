import { z } from "zod";

export const SetChannelPurposeConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
    purpose: z.string().max(250, "purpose must be 250 characters or fewer."),
  })
  .strict();
export type SetChannelPurposeConfig = z.infer<
  typeof SetChannelPurposeConfigSchema
>;
