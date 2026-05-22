import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:remove_reaction`.
 *
 * Mirrors `removeReaction.schema.ts` (same shape as `add_reaction`):
 *   - `channel`  (required) — combobox sourced from `slack:channels`.
 *   - `ts`       (required) — message timestamp.
 *   - `reaction` (required) — emoji name (handler normalizes outer colons).
 *
 * V2 ships Slack's direct "remove a specific reaction" semantic — NOT
 * V1's bulk "remove all reactions this bot added" custom behavior. The
 * field surface matches Slack's `reactions.remove` exactly.
 *
 * Required scope: `reactions:write`.
 */
export const slackRemoveReactionMeta: ActionMeta = {
  key: "slack:remove_reaction",
  provider: "slack",
  type: "remove_reaction",
  displayName: "Remove Reaction",
  description:
    "Remove a specific emoji reaction from a Slack message via reactions.remove. Identifies the target message via the (Channel, Timestamp) pair and removes only the named reaction. Both `thumbsup` and `:thumbsup:` are accepted; the handler strips outer colons.",
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
      name: "reaction",
      label: "Reaction",
      description:
        "Emoji name to remove (e.g. `thumbsup`). Bare name OR colon-wrapped (`:thumbsup:`) both work.",
      type: "text",
      required: true,
      placeholder: "thumbsup",
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
    {
      name: "reaction",
      type: "string",
      description: "Normalized reaction name (outer colons stripped).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
};
