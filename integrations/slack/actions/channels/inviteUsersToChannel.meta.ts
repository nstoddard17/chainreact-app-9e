import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:invite_users_to_channel`.
 *
 * Mirrors `inviteUsersToChannel.schema.ts`:
 *   - `channel`                (required) — combobox sourced.
 *   - `users`                  (required) — `string-array` of user ids
 *                                           (`U…`). Schema accepts
 *                                           CSV or array; the
 *                                           Slice 3.13 chip renderer
 *                                           writes `string[]`
 *                                           natively. Per-id regex
 *                                           validation runs at the
 *                                           handler boundary (post-
 *                                           parseRecipients).
 *   - `sendInviteNotification` (required boolean) — Q11: no hidden
 *                                                   default; the
 *                                                   author opts in
 *                                                   to notifications
 *                                                   explicitly.
 *
 * CONFIG-UX sweep: `users` keeps the `string-array` shape (the saved
 * value is still `string[]` of U-ids) but now sources per-chip options
 * from the registered `slack:users` resolver with `allowManualEntry`
 * (same pattern as gmail `labelIds`). Pasting / wiring raw ids still
 * works.
 *
 * Required scope: `channels:manage` (or `groups:write`).
 *
 * Outputs mirror `inviteUsersToChannel.ts:return` — `{channel: object,
 * users: string(CSV), invited_count}`.
 */
export const slackInviteUsersToChannelMeta: ActionMeta = {
  key: "slack:invite_users_to_channel",
  provider: "slack",
  type: "invite_users_to_channel",
  displayName: "Invite Users to Channel",
  description:
    "Invite one or more Slack users to a channel via conversations.invite. Provide user ids (U-prefixed); the handler validates ids and rejects malformed entries. Send Invite Notification is required — no silent default.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "users",
      label: "User ids",
      description:
        "Pick the people to invite, or paste / wire user ids from an earlier step.",
      type: "string-array",
      optionsSource: "slack:users",
      allowManualEntry: true,
      required: true,
      placeholder: "U01ABC23DEF",
    },
    {
      name: "sendInviteNotification",
      label: "Send invite notification",
      description:
        "Whether Slack notifies the invitees. No silent default — choose explicitly.",
      type: "boolean",
      required: true,
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "object",
      description:
        "Full Slack channel record after the invite (Slack returns the channel object verbatim).",
    },
    {
      name: "users",
      type: "string",
      description:
        "Comma-separated list of user ids that were invited (the resolved CSV sent to Slack).",
    },
    {
      name: "invited_count",
      type: "number",
      description: "Number of user ids submitted in the invite call.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 240,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Adds users to a channel — affects others' notifications and visibility.",
};
