import { z } from "zod";

export const RenameChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
    name: z
      .string()
      .min(1, "name is required.")
      .max(80, "name must be 80 characters or fewer."),
  })
  .strict();
export type RenameChannelConfig = z.infer<typeof RenameChannelConfigSchema>;
