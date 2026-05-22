import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:pin_message`.
 *
 * Mirrors `pinMessage.schema.ts`:
 *   - `channel` (required) — combobox sourced from `slack:channels`.
 *   - `ts`      (required) — message timestamp.
 *
 * Required scope: `pins:write`.
 */
export const slackPinMessageMeta: ActionMeta = {
  key: "slack:pin_message",
  provider: "slack",
  type: "pin_message",
  displayName: "Pin Message",
  description:
    "Pin a Slack message via pins.add. Identifies the target message via the (Channel, Timestamp) pair from an upstream Slack send/post action's output. The bot must be a member of the channel.",
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
  displayOrder: 130,
};
