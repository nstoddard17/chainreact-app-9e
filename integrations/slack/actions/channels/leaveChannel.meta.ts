import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:leave_channel`.
 *
 * Mirrors `leaveChannel.schema.ts`: single required channel id
 * (`^[CG][A-Z0-9]+$`). Removes the bot from the channel via
 * `conversations.leave`.
 *
 * Required scope: `channels:manage` / `groups:write` (per channel kind).
 *
 * Outputs mirror `leaveChannel.ts:return` — `{channel}` (echoed).
 */
export const slackLeaveChannelMeta: ActionMeta = {
  key: "slack:leave_channel",
  provider: "slack",
  type: "leave_channel",
  displayName: "Leave Channel",
  description:
    "Remove the bot from a Slack channel via conversations.leave. The channel itself is unchanged.",
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
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the bot left (echoed from input).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 230,
};
