import { z } from "zod";

/**
 * Resolved-config schema for the Slack create_channel action
 * (Slack 2.3 Commit 3).
 *
 * `name` is 1–80 chars; Slack also sanitizes server-side (lowercase,
 * `[a-z0-9-_]`).
 *
 * `isPrivate` is required — no silent default. Public vs. private is a
 * workspace-visibility decision that the workflow author must own. Per
 * Q11 (no hidden high-risk defaults) and the Slack 2.3 plan §5.2 +
 * §6 decision 6.
 *
 * V1 fields intentionally dropped (Slack 2.3 plan §5.2): `initialMembers`,
 * `autoArchiveSettings`, `customChannelHeader`. None are API features
 * of conversations.create; workflow authors compose multi-step flows
 * if they need post-create work.
 *
 * `.strict()` rejects unknown keys — typo / drift defense per the
 * established Slack 2.1 schema pattern.
 */
export const CreateChannelConfigSchema = z
  .object({
    name: z
      .string()
      .min(1, "name is required.")
      .max(80, "name must be 80 characters or fewer."),
    isPrivate: z.boolean({
      required_error: "isPrivate is required (no hidden default).",
    }),
  })
  .strict();
export type CreateChannelConfig = z.infer<typeof CreateChannelConfigSchema>;
