import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:unpin_message`.
 *
 * Mirrors `unpinMessage.schema.ts` (same shape as `pin_message`):
 *   - `channel` (required) — combobox sourced from `slack:channels`.
 *   - `ts`      (required) — message timestamp.
 *
 * Required scope: `pins:write`.
 */
export const slackUnpinMessageMeta: ActionMeta = {
  key: "slack:unpin_message",
  provider: "slack",
  type: "unpin_message",
  displayName: "Unpin Message",
  description:
    "Unpin a previously pinned Slack message via pins.remove. Identifies the target message via the (Channel, Timestamp) pair.",
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
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description: "Slack channel id (echoed from input).",
    },
    {
      name: "ts",
      type: "string",
      description: "Slack message timestamp (echoed from input).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
