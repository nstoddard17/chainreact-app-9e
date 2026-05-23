import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:archive_channel`.
 *
 * Mirrors `archiveChannel.schema.ts`: a single required channel id
 * matching `^[CG][A-Z0-9]+$`. The picker surfaces public + private
 * channels; the saved value is the channel id.
 *
 * Required scope: `channels:manage` (or `groups:write` for private).
 *
 * Outputs mirror `archiveChannel.ts:return` — `{channel}` (echoed).
 */
export const slackArchiveChannelMeta: ActionMeta = {
  key: "slack:archive_channel",
  provider: "slack",
  type: "archive_channel",
  displayName: "Archive Channel",
  description:
    "Archive a Slack channel via conversations.archive. Archived channels become read-only; their messages remain searchable. Use Unarchive Channel to restore.",
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
      description: "Slack channel id that was archived (echoed from input).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 190,
  isDestructive: true,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Archives a channel — members lose access; unarchive is possible but channel history is hidden until then.",
};
