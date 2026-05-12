import { z } from "zod";

/**
 * Resolved-config schema for the Slack invite_users_to_channel action
 * (Slack 2.3 Commit 3).
 *
 * `users` accepts either a CSV string ("U1,U2,U3") or a string array
 * (parsed by the handler via the Q7 parseRecipients helper). Empty
 * inputs are rejected at handler boundary (post-parse).
 *
 * Q11 — `sendInviteNotification` is required. Slack's
 * conversations.invite currently always notifies invitees, but the
 * field is preserved as explicit acknowledgement of notification
 * intent (matches V1's Q11-era contract). No silent default.
 *
 * V1 fields intentionally dropped (Slack 2.3 plan §5.3):
 * `customWelcomeMessage`, the pre-flight bot-self-join, the per-user
 * retry fallback. Workflow authors compose those steps explicitly.
 *
 * `.strict()` rejects unknown keys.
 */
export const InviteUsersToChannelConfigSchema = z
  .object({
    channel: z
      .string()
      .regex(
        /^[CG][A-Z0-9]+$/,
        "channel must be a Slack channel id (C… or G…).",
      ),
    users: z.union([
      z.string().min(1, "users is required (CSV or array)."),
      z.array(z.string().min(1)).min(1, "users must include at least one id."),
    ]),
    sendInviteNotification: z.boolean({
      required_error: "sendInviteNotification is required (no hidden default).",
    }),
  })
  .strict();
export type InviteUsersToChannelConfig = z.infer<
  typeof InviteUsersToChannelConfigSchema
>;
