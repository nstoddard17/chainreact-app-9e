import { z } from "zod";

export const UnarchiveChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
  })
  .strict();
export type UnarchiveChannelConfig = z.infer<
  typeof UnarchiveChannelConfigSchema
>;
