import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `discord:delete_message`.
 *
 * **Destructive bulk action — full destructive trio.** Mirrors
 * `deleteMessage.schema.ts` (6 fields). Required: `guildId`,
 * `channelId`. Optional filter inputs: `messageIds[]`, `userIds[]`,
 * `keywords[]`, `keywordMatchType`. Field names preserve V1
 * camelCase verbatim.
 *
 * Filter routing (mirrors handler):
 *   1. Explicit `messageIds[]` → delete those specific messages.
 *   2. `userIds[]` and/or `keywords[]` → fetch last 100 messages,
 *      filter, then delete the matches.
 *   3. None of the above → handler returns
 *      `{ deletedCount: 0, ... }` without an API call (empty-filter
 *      guard refuses to delete an unbounded set).
 *
 * **`messageIds[]` / `userIds[]` are `string-array` WITH pickers.**
 * The FieldMeta contract allows `optionsSource` on `string-array`
 * (SWEEP-2), so `messageIds[]` consumes `discord:messages`
 * (deps: channelId) and `userIds[]` consumes `discord:members`
 * (deps: guildId), both with `allowManualEntry` for pasted ids.
 * `keywords[]` stays a plain chip list (free text by nature).
 *
 * **`keywordMatchType` default = "partial".** Mirrors V1 runtime
 * default + the handler schema's `.default("partial")` per Slice
 * 3.DISCORD-1 §7.1. The risk description explicitly calls out
 * "partial" as the default because partial = case-insensitive
 * substring = the widest match radius.
 *
 * Outputs intentionally exclude message content. `messageIds[]` are
 * opaque snowflake ids — NOT in the structural sensitive-output
 * suspicious set. Counts + ids + channelId + timestamp are all
 * non-sensitive.
 *
 * Risk: HIGH + `isDestructive: true` + `requiresConfirmation: true`.
 * Bulk deletes are irreversible (Discord retains no per-channel
 * undelete). The destructive trio surfaces the typed-confirmation
 * modal in the builder UI.
 */
export const discordDeleteMessageMeta: ActionMeta = {
  key: "discord:delete_message",
  provider: "discord",
  type: "delete_message",
  displayName: "Delete Message(s)",
  description:
    "Permanently delete one or more Discord messages. Supports three filter modes (explicit ids, by author, by keyword). When 2-100 messages match, uses Discord's bulk-delete endpoint; otherwise falls back to per-message delete. **Irreversible — Discord retains no per-channel undelete.** Empty filters return `deletedCount: 0` without hitting the API (safe default).",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description: "Server containing the messages. Only servers where the ChainReact bot has been added appear.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description: "Channel containing the message(s) to delete. Pick a server first.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "messageIds",
      label: "Message ids",
      description:
        "Specific messages to delete. Pick from the channel's recent messages or paste message ids. When set, the author/keyword filters are ignored.",
      type: "string-array",
      optionsSource: "discord:messages",
      dependsOn: "channelId",
      allowManualEntry: true,
      required: false,
      placeholder: "1234567890123456789",
    },
    {
      name: "userIds",
      label: "From user ids",
      description:
        "Only delete messages posted by these members (checks the channel's last 100 messages). Combines with keywords.",
      type: "string-array",
      optionsSource: "discord:members",
      dependsOn: "guildId",
      allowManualEntry: true,
      required: false,
      placeholder: "1234567890123456789",
    },
    {
      name: "keywords",
      label: "Containing keywords",
      description:
        "Only delete messages containing these words (checks the channel's last 100 messages). Combines with the member filter.",
      type: "string-array",
      required: false,
      placeholder: "spam",
    },
    {
      name: "keywordMatchType",
      label: "Keyword match",
      description:
        "**Default is `partial` (case-insensitive substring — widest match radius).** Pick `whole` for whole-word case-insensitive match; pick `exact` for case-sensitive substring. Only used when `keywords` is set.",
      type: "select",
      required: false,
      defaultValue: "partial",
      options: [
        { value: "partial", label: "Partial (case-insensitive substring — DEFAULT)" },
        { value: "whole", label: "Whole word (case-insensitive)" },
        { value: "exact", label: "Exact (case-sensitive substring)" },
      ],
    },
  ],
  outputs: [
    {
      name: "deletedCount",
      type: "number",
      description: "Number of messages successfully deleted.",
    },
    {
      name: "failedCount",
      type: "number",
      description: "Number of messages that failed to delete (only non-zero on the per-message fallback path).",
    },
    {
      name: "totalProcessed",
      type: "number",
      description: "Total messages the handler attempted to delete (sum of deleted + failed).",
    },
    {
      name: "messageIds",
      type: "array",
      description:
        "Snowflake ids of the messages that were deleted. Opaque provider ids — not flagged sensitive (no content).",
    },
    {
      name: "channelId",
      type: "string",
      description: "Channel id (echoed from input).",
    },
    {
      name: "errors",
      type: "array",
      description:
        "Optional. Per-id failure messages when single-fallback delete encountered errors. Only present when failedCount > 0.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Bulk-deletes Discord messages. Irreversible — Discord retains no per-channel undelete. Default `keywordMatchType` is `partial` (case-insensitive substring — widest match radius). Confirm filter inputs carefully.",
};
