import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:add_reaction`.
 *
 * Mirrors `addReaction.schema.ts`:
 *   - `channel`  (required) — combobox sourced from `slack:channels`.
 *   - `ts`       (required) — message timestamp.
 *   - `reaction` (required) — emoji name. The handler's
 *                             `normalizeReactionName` accepts both
 *                             `thumbsup` and `:thumbsup:`; Slack
 *                             expects the bare form so the handler
 *                             strips outer colons before dispatching.
 *
 * Required scope: `reactions:write`.
 *
 * Outputs mirror the handler's echo shape: `{channel, ts, reaction}`.
 */
export const slackAddReactionMeta: ActionMeta = {
  key: "slack:add_reaction",
  provider: "slack",
  type: "add_reaction",
  displayName: "Add Reaction",
  description:
    "Add an emoji reaction to a Slack message via reactions.add. Identifies the target message via the (Channel, Timestamp) pair from an upstream Slack send/post action's output. Both `thumbsup` and `:thumbsup:` are accepted; the handler strips outer colons before calling Slack.",
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
    {
      name: "reaction",
      label: "Reaction",
      description:
        "Emoji name (e.g. `thumbsup`, `tada`, `white_check_mark`). Bare name OR colon-wrapped (`:thumbsup:`) both work — the handler normalizes.",
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
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
