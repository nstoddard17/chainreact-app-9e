import { z } from "zod";

export const LeaveChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
  })
  .strict();
export type LeaveChannelConfig = z.infer<typeof LeaveChannelConfigSchema>;
