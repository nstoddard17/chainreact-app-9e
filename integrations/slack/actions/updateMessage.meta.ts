import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:update_message`.
 *
 * Mirrors `updateMessage.schema.ts`:
 *   - `channel` (required) — Slack channel id (combobox sourced).
 *   - `ts`      (required) — Slack message timestamp identifying the
 *                            target message.
 *   - `text`    (required) — new message body (textarea).
 *
 * Required scope: `chat:write`.
 *
 * Outputs match `updateMessage.ts:return` exactly.
 */
export const slackUpdateMessageMeta: ActionMeta = {
  key: "slack:update_message",
  provider: "slack",
  type: "update_message",
  displayName: "Update Message",
  description:
    "Update an existing Slack message's text in place via chat.update. The bot can only edit messages it posted (or messages it has admin permission to edit). Identifies the target message via the (Channel, Timestamp) pair from an upstream Send action's output.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      required: true,
      placeholder: "Search channels…",
    },
    {
      name: "ts",
      label: "Message timestamp",
      description:
        "Slack message timestamp (`<seconds>.<microseconds>`). Wire from an upstream Slack send/post action's `ts` output.",
      type: "text",
      required: true,
      placeholder: "1700000000.000100",
    },
    {
      name: "text",
      label: "New message",
      description:
        "Replacement message body. Slack rewrites the message in place — no edit history is preserved beyond Slack's own (edited) marker.",
      type: "textarea",
      required: true,
      placeholder: "Updated message body",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id the message was edited in.",
    },
    {
      name: "ts",
      type: "string",
      description: "Slack message timestamp of the edited message (unchanged).",
    },
    {
      name: "text",
      type: "string",
      description: "Echo of the new message text as Slack stored it. Marked sensitive — message body redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Edits an existing Slack message — Slack surfaces an `(edited)` indicator.",
};
