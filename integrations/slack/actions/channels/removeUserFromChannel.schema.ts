import { z } from "zod";

export const RemoveUserFromChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
    user: z
      .string()
      .regex(/^U[A-Z0-9]+$/, "user must be a Slack user id (U…)."),
  })
  .strict();
export type RemoveUserFromChannelConfig = z.infer<
  typeof RemoveUserFromChannelConfigSchema
>;
