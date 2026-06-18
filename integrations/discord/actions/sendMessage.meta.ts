import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `discord:send_message`.
 *
 * Mirrors `sendMessage.schema.ts` (3 fields). Required: `guildId`,
 * `channelId`, `message`. Field names preserve V1 camelCase verbatim
 * per Slice 3.DISCORD-1 §7.1 — NO snake_case normalization.
 *
 * Pickers:
 *   - `guildId` → `discord:guilds` combobox (no deps).
 *   - `channelId` → `discord:channels` combobox (deps: ["guildId"]).
 *     Resolver filters to text-shaped channels (GUILD_TEXT,
 *     GUILD_ANNOUNCEMENT, GUILD_FORUM).
 *
 * Message body:
 *   - Plain `textarea`. Discord markdown / mentions
 *     (`**bold**`, `<@user_id>`, `<#channel_id>`, `<:emoji_id:>`) is
 *     entered as raw text. V1's specialized `discord-rich-text`
 *     FieldType is intentionally NOT introduced per Slice 3.DISCORD-1
 *     §7.1 + §2.6 — a polish slice may add it later without changing
 *     the saved config shape.
 *   - Discord caps message length at 2000 chars; schema-layer guard
 *     surfaces a clear local error instead of a Discord 400.
 *
 * Outputs mirror `sendMessage.ts:return` exactly. `content` is in the
 * sensitive-output structural test's suspicious set — marked
 * `sensitive: true` because the echoed message body may carry
 * workflow-author-supplied PII via `{{variable}}` interpolation.
 * Opaque ids (`messageId`, `channelId`, `guildId`) are NOT marked
 * sensitive (not in the suspicious set; not PII). `author` is a
 * bounded `{id, username, bot}` shape — bot identity is non-sensitive.
 *
 * Risk: medium. Recoverable via `edit_message` / `delete_message`.
 * `@everyone` / `@here` mentions broadcast widely; risk description
 * warns authors to scope mentions carefully. Discord-side
 * permissions still enforce who the bot can mention; the meta cannot
 * gate that at config time.
 */
export const discordSendMessageMeta: ActionMeta = {
  key: "discord:send_message",
  provider: "discord",
  type: "send_message",
  displayName: "Send Message",
  description:
    "Post a message to a Discord channel as the ChainReact bot. Supports Discord markdown (`**bold**`, `__underline__`) and mentions (`<@user_id>`, `<#channel_id>`, `<:emoji_id:>`) entered as raw text in the message field. `@everyone` / `@here` broadcast widely — scope mentions carefully.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description:
        "Discord server (guild) the bot is installed in. Picker sourced from `discord:guilds` — only servers where ChainReact's bot has been added appear.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      label: "Channel",
      description:
        "Text channel inside the selected server. Picker sourced from `discord:channels`; gated on Server — change the Server and the channel picker re-fetches. Voice / category / thread channels are excluded.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      sensitivity: "recipient",
      placeholder: "Select Server first",
    },
    {
      name: "message",
      label: "Message",
      description:
        "Message body. Enter Discord markdown (`**bold**`, `__underline__`, `~~strikethrough~~`) and mention syntax (`<@user_id>`, `<#channel_id>`, `<:emoji_name:emoji_id>`) as raw text. Discord caps message length at 2000 characters.",
      type: "textarea",
      required: true,
      placeholder: "Hello from ChainReact! <#channel_id> mentions render as links.",
    },
  ],
  outputs: [
    {
      name: "messageId",
      type: "string",
      description: "Discord message id (snowflake). Use as the `messageId` input to `edit_message` or `delete_message`.",
    },
    {
      name: "channelId",
      type: "string",
      description: "Discord channel id the message was posted to (echoed from input).",
    },
    {
      name: "guildId",
      type: "string",
      description: "Discord server id (echoed from input).",
    },
    {
      name: "content",
      type: "string",
      description:
        "Echo of the posted message body from Discord's response. Marked sensitive — may carry workflow-author-supplied PII via `{{variable}}` interpolation.",
      sensitive: true,
    },
    {
      name: "timestamp",
      type: "string",
      description: "ISO-8601 timestamp Discord assigned to the posted message.",
    },
    {
      name: "author",
      type: "object",
      description: "Bot identity Discord echoed back on the response. `{id, username, bot}`.",
      fields: [
        { name: "id", type: "string", description: "Bot user id (snowflake)." },
        { name: "username", type: "string", description: "Bot's username." },
        { name: "bot", type: "boolean", description: "Always true for messages posted by the bot." },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Posts a public message to a Discord channel. Recoverable via edit_message / delete_message, but @everyone / @here mentions broadcast widely.",
};
