import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:unarchive_channel`.
 *
 * Mirrors `unarchiveChannel.schema.ts` (same shape as
 * `archive_channel`). RESOLVERS-1: the picker now uses the dedicated
 * `slack:channels_archived` resolver (conversations.list with
 * `exclude_archived=false`, filtered to `is_archived: true`) so authors
 * can pick the archived channel directly. Manual entry stays available
 * for archived channels beyond the resolver's single bounded page.
 *
 * Required scope: `channels:manage` (or `groups:write`) at runtime;
 * the picker reads on the already-granted `channels:read`/`groups:read`.
 */
export const slackUnarchiveChannelMeta: ActionMeta = {
  key: "slack:unarchive_channel",
  provider: "slack",
  type: "unarchive_channel",
  displayName: "Unarchive Channel",
  description:
    "Restore an archived Slack channel via conversations.unarchive. Pick the archived channel from the list, or paste its id (C…/G…).",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Archived Slack channel to restore. The picker lists archived channels only; you can also paste a channel id (C…/G…) or wire one via `{{...}}` from a List Channels output.",
      type: "combobox",
      optionsSource: "slack:channels_archived",
      allowManualEntry: true,
      required: true,
      placeholder: "Search archived channels…",
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
