import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:delete_message`.
 *
 * Mirrors `deleteMessage.schema.ts`:
 *   - `channel` (required) — Slack channel id (combobox sourced).
 *   - `ts`      (required) — message timestamp.
 *
 * Required scope: `chat:write`.
 *
 * Outputs match `deleteMessage.ts:return` exactly.
 */
export const slackDeleteMessageMeta: ActionMeta = {
  key: "slack:delete_message",
  provider: "slack",
  type: "delete_message",
  displayName: "Delete Message",
  description:
    "Delete a Slack message via chat.delete. The bot can only delete its own messages unless it has workspace-admin scopes — Slack returns `cant_delete_message` when the bot lacks permission.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "ts",
      label: "Message timestamp",
      description:
        "The message's timestamp. Paste or wire the `ts` output of an earlier Slack message step.",
      type: "text",
      required: true,
      placeholder: "1700000000.000100",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the message was deleted from.",
    },
    {
      name: "ts",
      type: "string",
      description: "Timestamp of the deleted message (echoed from Slack).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: true,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Permanently removes a Slack message. Audit log may retain a record on Enterprise plans.",
};
