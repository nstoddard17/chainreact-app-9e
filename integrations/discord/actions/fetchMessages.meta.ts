import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `discord:fetch_messages`.
 *
 * Mirrors `fetchMessages.schema.ts` (8 fields). Required: `guildId`,
 * `channelId`. V1 runtime defaults preserved on the UI side:
 * `limit` = 20, `sortOrder` = "newest", `filterType` = "none",
 * `caseSensitive` = false.
 *
 * **`filterType` 9-value enum** matches the handler schema exactly:
 *   - `none`, `author`, `content`, `has_attachments`, `has_embeds`,
 *     `is_pinned`, `from_bots`, `from_humans`, `has_reactions`.
 *
 * **Conditional field visibility (CONFIG-UX-SETUP-ADVANCED-1).**
 * `filterAuthor` is gated on `filterType === "author"`;
 * `filterContent` + `caseSensitive` on `filterType === "content"` via
 * top-level `visibleWhen` — mirrors V1's UI and the handler, which
 * ignores irrelevant filter inputs. The saved-config shape is
 * unchanged (SchemaForm clears a hidden dependent when the controller
 * changes, matching the handler's ignore semantics).
 *
 * Outputs mirror `fetchMessages.ts:return`. `messages[]` is the
 * primary surface — marked sensitive because the array carries
 * `content`, `author`, `attachments`, `mentions` per message
 * (bulk PII / user-typed bodies). The structural sensitive-output
 * test would flag `messages` even if we left it unmarked
 * (suspicious-set name). `count` / `channelId` / `filterType` /
 * `filterApplied` / `totalFetched` are bounded metadata; not flagged.
 *
 * Risk: low — pure read. No `isDestructive`, no `requiresConfirmation`.
 */
export const discordFetchMessagesMeta: ActionMeta = {
  key: "discord:fetch_messages",
  provider: "discord",
  type: "fetch_messages",
  displayName: "Fetch Messages",
  description:
    "Read the most recent messages from a Discord channel. Optionally filter by author, content, attachments, embeds, pinned-state, bot-vs-human, or reactions. Single-page read (max 100); workflows that need more compose multiple calls.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description: "Server to read from. Only servers where the ChainReact bot has been added appear.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description: "Channel to read messages from. Pick a server first.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "limit",
      label: "Max messages",
      description: "How many matching messages to return (up to 100). Default 20.",
      type: "number",
      required: false,
      defaultValue: 20,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "sortOrder",
      label: "Sort order",
      description: "Order the returned messages by their Discord timestamp. **Default: newest** (Discord's wire default).",
      type: "select",
      required: false,
      defaultValue: "newest",
      options: [
        { value: "newest", label: "Newest first (Discord default)" },
        { value: "oldest", label: "Oldest first" },
      ],
    },
    {
      name: "filterType",
      label: "Filter",
      description:
        "Limit the returned messages to a category. Default: none (no filter). Picking an author or content filter reveals its extra setting.",
      type: "select",
      required: false,
      defaultValue: "none",
      options: [
        { value: "none", label: "None (return all)" },
        { value: "author", label: "By specific author" },
        { value: "content", label: "Containing specific text" },
        { value: "has_attachments", label: "With attachments" },
        { value: "has_embeds", label: "With embeds" },
        { value: "is_pinned", label: "Pinned only" },
        { value: "from_bots", label: "From bots only" },
        { value: "from_humans", label: "From humans only" },
        { value: "has_reactions", label: "With reactions" },
      ],
    },
    {
      name: "filterAuthor",
      label: "Author (filter)",
      description: "Only return messages posted by this member. Pick a server first.",
      type: "combobox",
      optionsSource: "discord:members",
      dependsOn: "guildId",
      required: false,
      visibleWhen: { field: "filterType", valueIn: ["author"] },
      placeholder: "Select Server first",
    },
    {
      name: "filterContent",
      label: "Content (filter)",
      description: "Only return messages containing this text.",
      type: "text",
      required: false,
      visibleWhen: { field: "filterType", valueIn: ["content"] },
      placeholder: "welcome",
    },
    {
      name: "caseSensitive",
      label: "Case-sensitive content match",
      description:
        "When on, the text must match with the same upper/lower case. Default: off (case-insensitive).",
      type: "boolean",
      required: false,
      defaultValue: false,
      visibleWhen: { field: "filterType", valueIn: ["content"] },
    },
  ],
  outputs: [
    {
      name: "messages",
      type: "array",
      description:
        "Array of bounded message projections. Marked sensitive — each row carries `content`, `author`, `attachments`, and `mentions` (bulk PII / user-typed bodies).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of messages returned after filtering and limit-trimming.",
    },
    {
      name: "channelId",
      type: "string",
      description: "Channel id (echoed).",
    },
    {
      name: "filterType",
      type: "string",
      description: "Filter mode used for this fetch (echoed).",
    },
    {
      name: "filterApplied",
      type: "boolean",
      description: "True when a non-`none` filter was applied; false otherwise.",
    },
    {
      name: "totalFetched",
      type: "number",
      description: "Raw count of messages Discord returned before filtering. Useful for diagnosing under-filled result pages.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads Discord messages. Pure read; no side effects. Output array carries user-typed content + author metadata — marked sensitive.",
};
