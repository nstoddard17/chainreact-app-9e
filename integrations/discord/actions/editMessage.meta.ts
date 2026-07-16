import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `discord:edit_message`.
 *
 * Mirrors `editMessage.schema.ts` (4 fields). Required: `guildId`,
 * `channelId`, `messageId`, `content`. Field names preserve V1
 * camelCase verbatim.
 *
 * Pickers:
 *   - `guildId` → `discord:guilds`.
 *   - `channelId` → `discord:channels` (deps: ["guildId"]).
 *   - `messageId` → `discord:bot_messages` (deps: ["channelId"]).
 *     **Bot-authored-only picker** — Discord enforces that bots can
 *     only edit messages they themselves posted (403 + code 50005
 *     otherwise). The resolver filters to messages whose `author.id`
 *     matches the bot's own user id so the picker never surfaces
 *     un-editable messages.
 *
 * Why `guildId` is required even though Discord's PATCH endpoint only
 * needs `(channelId, messageId)`: V1's UI uses `guildId` to drive the
 * channel picker. The schema preserves the field for symmetry with
 * V1's mental model + cascade ergonomics. Documented in
 * `editMessage.schema.ts` header.
 *
 * Outputs mirror `editMessage.ts:return` exactly. `content` is
 * sensitive — same rationale as `send_message`.
 *
 * Risk: medium. Edits are reversible by another edit. Discord's
 * "bot-can-only-edit-own-messages" enforcement means there is no
 * cross-user content-rewriting risk.
 */
export const discordEditMessageMeta: ActionMeta = {
  key: "discord:edit_message",
  provider: "discord",
  type: "edit_message",
  displayName: "Edit Message",
  description:
    "Edit a message the ChainReact bot previously posted. Discord limits edits to the original author — the picker only surfaces messages the bot authored (`discord:bot_messages`). New content replaces the original; partial / append edits are not supported by Discord's API.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description: "Server containing the message. Only servers where the ChainReact bot has been added appear.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description: "Channel containing the message. Pick a server first.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "messageId",
      label: "Message",
      description:
        "Message to edit. Only messages the ChainReact bot itself posted can be edited — Discord blocks editing anyone else's. Pick a channel first.",
      type: "combobox",
      optionsSource: "discord:bot_messages",
      dependsOn: "channelId",
      required: true,
      placeholder: "Select Channel first",
    },
    {
      name: "content",
      label: "New content",
      description:
        "Replacement message body. Discord markdown + mention syntax supported. Caps at 2000 characters.",
      type: "textarea",
      required: true,
      placeholder: "Edited message…",
    },
  ],
  outputs: [
    {
      name: "messageId",
      type: "string",
      description: "Discord message id (echoed).",
    },
    {
      name: "channelId",
      type: "string",
      description: "Discord channel id (echoed).",
    },
    {
      name: "content",
      type: "string",
      description:
        "Echo of the new content from Discord's response. Marked sensitive — may carry workflow-author-supplied PII via `{{variable}}` interpolation.",
      sensitive: true,
    },
    {
      name: "editedTimestamp",
      type: "string",
      description: "ISO-8601 timestamp of the edit, or null when Discord omits it.",
    },
    {
      name: "author",
      type: "object",
      description: "Bot identity Discord echoed back. `{id, username, bot}`.",
      fields: [
        { name: "id", type: "string", description: "Bot user id (snowflake)." },
        { name: "username", type: "string", description: "Bot's username." },
        { name: "bot", type: "boolean", description: "Always true." },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Replaces the content of a bot-authored Discord message. Reversible by another edit. Discord blocks edits to messages authored by other users.",
};
