import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:join_channel`.
 *
 * Mirrors `joinChannel.schema.ts`: single required channel id
 * (`^[CG][A-Z0-9]+$`). Bots can only join public channels via
 * `conversations.join`; private channels require an invite from a
 * human member.
 *
 * Required scope: `channels:join`.
 *
 * Outputs mirror `joinChannel.ts:return` — `{channel: object, id,
 * name}`.
 */
export const slackJoinChannelMeta: ActionMeta = {
  key: "slack:join_channel",
  provider: "slack",
  type: "join_channel",
  displayName: "Join Channel",
  description:
    "Have the bot join a public Slack channel via conversations.join. Bots cannot self-join private channels — use Invite Users to Channel (from a human user) for those.",
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
      required: true,
      placeholder: "Search channels…",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "object",
      description: "Full Slack channel record after join.",
    },
    {
      name: "id",
      type: "string",
      description: "Slack channel id (echoed).",
    },
    {
      name: "name",
      type: "string",
      description: "Channel name (post-Slack-sanitization).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 220,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
