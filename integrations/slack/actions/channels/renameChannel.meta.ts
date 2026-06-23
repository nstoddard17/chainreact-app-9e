import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:rename_channel`.
 *
 * Mirrors `renameChannel.schema.ts`:
 *   - `channel` (required) — combobox sourced.
 *   - `name`    (required) — new name (1..80; sanitized by Slack).
 *
 * Required scope: `channels:manage` (or `groups:write`).
 *
 * Outputs mirror `renameChannel.ts:return` — `{channel: object, id,
 * name}`.
 */
export const slackRenameChannelMeta: ActionMeta = {
  key: "slack:rename_channel",
  provider: "slack",
  type: "rename_channel",
  displayName: "Rename Channel",
  description:
    "Rename a Slack channel via conversations.rename. Slack sanitizes the new name server-side (lowercase, [a-z0-9-_]).",
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
      name: "name",
      label: "New name",
      description:
        "1..80 chars. Slack lowercases and strips invalid characters server-side.",
      type: "text",
      required: true,
      placeholder: "deals-q4-renamed",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "object",
      description: "Full Slack channel record after rename.",
    },
    {
      name: "id",
      type: "string",
      description: "Slack channel id (unchanged by rename).",
    },
    {
      name: "name",
      type: "string",
      description: "Final channel name as Slack stored it (post-sanitization).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 210,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Renames a channel — visible to all members; bookmarks/links survive.",
};
