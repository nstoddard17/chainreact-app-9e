import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:remove_user_from_channel`.
 *
 * Mirrors `removeUserFromChannel.schema.ts`:
 *   - `channel` (required) — combobox sourced.
 *   - `user`    (required) — Slack user id (`^U[A-Z0-9]+$`).
 *                            Stays `text` for v1; a future
 *                            `slack:users` resolver slice (3.39+)
 *                            will flip to combobox.
 *
 * Required scope: `channels:manage` (or `groups:write`).
 *
 * Outputs mirror `removeUserFromChannel.ts:return` — `{channel, user}`.
 */
export const slackRemoveUserFromChannelMeta: ActionMeta = {
  key: "slack:remove_user_from_channel",
  provider: "slack",
  type: "remove_user_from_channel",
  displayName: "Remove User from Channel",
  description:
    "Remove (kick) a Slack user from a channel via conversations.kick. Bot must have permission to remove members in that channel.",
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
      name: "user",
      label: "User",
      description:
        "Pick a workspace user, or paste / wire a Slack user id (U-prefixed) such as `{{trigger.user}}`.",
      type: "combobox",
      optionsSource: "slack:users",
      allowManualEntry: true,
      required: true,
      placeholder: "Search users or paste a user ID",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id (echoed from input).",
    },
    {
      name: "user",
      type: "string",
      description: "Slack user id that was removed (echoed from input).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 250,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Removes a user from a channel — they lose access until re-invited.",
};
