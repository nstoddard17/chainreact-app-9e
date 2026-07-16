import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `discord:new_message`.
 *
 * Polling-activated trigger. Activation seeds the
 * `snapshot.lastSeenMessageId` from the channel's current newest
 * message (or a synthesized "now" snowflake for empty channels), so
 * the first poll tick picks up messages created AFTER activation —
 * not the channel's historical backlog. Polling cadence is the V2
 * default (5 minutes); per-tier overrides land with the future
 * `pollingIntervals` per-role wiring.
 *
 * **Polling vs gateway tradeoff (per Slice 3.DISCORD-5).** V1 used a
 * persistent gateway WebSocket for sub-second latency on
 * `MESSAGE_CREATE`. V2 uses REST polling — `GET /channels/{id}/messages?after={id}`
 * — at ~5 minute cadence. Acceptable for content-moderation digests,
 * archival pipelines, and "new message in #releases → Slack mirror"
 * use cases; degraded for chatbot-reply patterns. Description copy
 * surfaces this explicitly so workflow authors set expectations
 * correctly.
 *
 * **Sensitive-output flags** mirror Slice 3.DISCORD-1 §5.2:
 *   - `content` — workflow-author-readable message body. May carry
 *     user-typed PII / mentions. Marked sensitive.
 *   - `authorName` — display name / username of message author.
 *     Marked sensitive.
 *   - `attachments` — file metadata (filename, size, url). The
 *     attachment download URLs are signed but still allow read access
 *     to anyone with the URL; marked sensitive.
 *   - `mentions` — user mention objects. Marked sensitive.
 *
 * **Operator setup burden:** the bot's `MESSAGE_CONTENT` privileged
 * intent must be enabled in the Discord Developer Portal for the
 * `content` field to arrive populated on messages the bot didn't
 * author. Discord auto-strips `content` to empty without the intent
 * (and requires approval for bots in 100+ guilds). Tracked in
 * `docs/slices/phase-3/missing-providers-status.md`.
 *
 * **Channel-name + guild-name** are not present in Discord's raw
 * message payload. The normalize function surfaces them as `null`;
 * a follow-up slice may plumb them through trigger config from the
 * activation-time picker values.
 */
export const discordNewMessageTriggerMeta: TriggerMeta = {
  key: "discord:new_message",
  provider: "discord",
  type: "new_message",
  displayName: "New Message Posted",
  description:
    "Fires when a new message is posted in the configured Discord channel. Polled every ~5 minutes — near real-time, not real-time (V1's gateway-based sub-second delivery is not used in V2). Optionally narrow by author or content keywords. The bot's MESSAGE_CONTENT privileged intent (Discord Developer Portal) must be enabled for the `content` field to arrive populated.",
  category: "messaging",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "guildId",
      label: "Server",
      description:
        "Server to watch. Only servers where the ChainReact bot has been added appear.",
      type: "combobox",
      optionsSource: "discord:guilds",
      required: true,
      placeholder: "Search servers…",
    },
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Text channel to watch for new messages. Pick a server first. Voice and thread channels are excluded.",
      type: "combobox",
      optionsSource: "discord:channels",
      dependsOn: "guildId",
      required: true,
      placeholder: "Select Server first",
    },
    {
      name: "contentFilter",
      label: "Content keywords (optional)",
      description:
        "Only run when the message contains any of these words (case-insensitive). Leave empty to run for every message.",
      type: "string-array",
      required: false,
      placeholder: "release notes",
      defaultValue: [],
    },
    {
      name: "authorFilter",
      label: "Author (optional)",
      description:
        "Only run for messages posted by this member. Pick a server first. Leave empty to run for any author.",
      type: "combobox",
      optionsSource: "discord:members",
      dependsOn: "guildId",
      required: false,
      placeholder: "Select Server first",
    },
  ],
  payloadShape: [
    {
      name: "messageId",
      type: "string",
      description: "Discord message id (snowflake). Globally unique; used as the dedup key.",
    },
    {
      name: "content",
      type: "string",
      description:
        "Message body text. Marked sensitive — may carry user-typed PII / mentions / paste-buffer content. Arrives EMPTY when the bot lacks the MESSAGE_CONTENT privileged intent (Discord Developer Portal setting).",
      sensitive: true,
    },
    {
      name: "authorId",
      type: "string",
      description: "Discord user id of the message author (snowflake).",
    },
    {
      name: "authorName",
      type: "string",
      description:
        "Display name / username of the author. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "channelId",
      type: "string",
      description: "Discord channel id (snowflake) the message was posted in.",
    },
    {
      name: "channelName",
      type: "string",
      description:
        "Human-readable channel name. NOT included in Discord's raw message payload — surfaced as `null` until a follow-up slice plumbs the channel-picker name into trigger config.",
    },
    {
      name: "guildId",
      type: "string",
      description: "Discord server id (snowflake) — echoed from trigger config.",
    },
    {
      name: "guildName",
      type: "string",
      description:
        "Human-readable server name. Same caveat as `channelName` — surfaced as `null` until a follow-up plumbs the server-picker name through.",
    },
    {
      name: "timestamp",
      type: "string",
      description: "ISO-8601 timestamp Discord assigned to the message at creation.",
    },
    {
      name: "attachments",
      type: "array",
      description:
        "File attachments on the message — `[{id, filename, size, url, contentType}, ...]`. Marked sensitive — the per-attachment `url` is a signed Discord CDN link granting read access; PII may live in filenames or attached files.",
      sensitive: true,
    },
    {
      name: "mentions",
      type: "array",
      description:
        "Users explicitly mentioned in the message — `[{id, username}, ...]`. Marked sensitive — PII (usernames).",
      sensitive: true,
    },
  ],
  displayOrder: 20,
};
