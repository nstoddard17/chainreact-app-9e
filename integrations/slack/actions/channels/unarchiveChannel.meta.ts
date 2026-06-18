import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:unarchive_channel`.
 *
 * Mirrors `unarchiveChannel.schema.ts` (same shape as
 * `archive_channel`). The picker surfaces public + private channels;
 * note that archived channels are excluded from the picker's
 * `slack:channels` resolver (`excludeArchived: true`), so authors
 * unarchiving must wire the channel id via a `{{...}}` reference
 * (e.g. from a List Channels call with `excludeArchived: false`).
 *
 * Required scope: `channels:manage` (or `groups:write`).
 */
export const slackUnarchiveChannelMeta: ActionMeta = {
  key: "slack:unarchive_channel",
  provider: "slack",
  type: "unarchive_channel",
  displayName: "Unarchive Channel",
  description:
    "Restore an archived Slack channel via conversations.unarchive. Archived channels do not appear in the channel picker — wire the id from an upstream List Channels call (with Exclude archived = false).",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Slack channel id to unarchive (C…/G…). The async picker only surfaces non-archived channels; wire the id via `{{...}}` from a List Channels output when needed.",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search or wire channel id…",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id that was unarchived (echoed from input).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 200,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Restores an archived channel — members regain access.",
};
