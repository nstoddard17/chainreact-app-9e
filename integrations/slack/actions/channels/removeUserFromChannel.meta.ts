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
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…).",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
    {
      name: "user",
      label: "User id",
      description:
        "Slack user id (U-prefixed). Wire from an upstream Slack action / trigger payload (e.g. `{{trigger.user}}`).",
      type: "text",
      required: true,
      placeholder: "U01ABC23DEF",
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
