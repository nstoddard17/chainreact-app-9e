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
 * **Conditional field visibility — NOT EXPRESSIBLE in V2 FieldMeta
 * contract today.** The contract has no `condition` / `visible` /
 * `when` field (see `contracts/actionMeta.ts:108-237`). V1 hides
 * `filterAuthor` unless `filterType === "author"`, hides
 * `filterContent` + `caseSensitive` unless `filterType === "content"`.
 * V2 mirrors the V1 schema behavior at runtime (the handler ignores
 * irrelevant filter inputs) but the meta surfaces all 3 conditional
 * fields always-visible with descriptions that explain when each one
 * applies. Pattern matches Gmail `search_emails` (Slice 3.15) —
 * documented in `searchEmails.meta.ts` header. A future contract
 * extension may add proper conditional visibility; the saved-config
 * shape would not change.
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
      description: "Discord server. Drives the channel picker.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description: "Channel to read messages from. Gated on Server.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "limit",
      label: "Max messages",
      description:
        "Maximum number of post-filter messages to return. Discord caps the wire limit at 100; when a filter is active the handler over-fetches up to 3× to give the result a chance to hit this count. **Default: 20.**",
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
        "Limit the returned messages to a category. **Default: `none`** (no filter). `author` requires `filterAuthor` below; `content` requires `filterContent`.",
      type: "select",
      required: false,
      defaultValue: "none",
      options: [
        { value: "none", label: "None (return all)" },
        { value: "author", label: "By specific author (requires Author below)" },
        { value: "content", label: "Containing specific text (requires Content below)" },
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
      description:
        "**Only used when Filter is set to `By specific author`.** Member to filter messages by. Picker sourced from `discord:members`; gated on Server. Other Filter modes ignore this field.",
      type: "combobox",
      optionsSource: "discord:members",
      dependsOn: "guildId",
      required: false,
      placeholder: "Select Server first",
    },
    {
      name: "filterContent",
      label: "Content (filter)",
      description:
        "**Only used when Filter is set to `Containing specific text`.** Text to match in each message's `content`. Other Filter modes ignore this field.",
      type: "text",
      required: false,
      placeholder: "welcome",
    },
    {
      name: "caseSensitive",
      label: "Case-sensitive content match",
      description:
        "**Only used when Filter is set to `Containing specific text`.** When true, the substring match is case-sensitive. **Default: false** (case-insensitive).",
      type: "boolean",
      required: false,
      defaultValue: false,
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
