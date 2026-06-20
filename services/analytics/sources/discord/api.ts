import { discordBotRequest } from "@/integrations/_shared/discord/api/_request";
import {
  DISCORD_CHANNEL_TYPE_GUILD_ANNOUNCEMENT,
  DISCORD_CHANNEL_TYPE_GUILD_FORUM,
  DISCORD_CHANNEL_TYPE_GUILD_TEXT,
  guildChannelsList,
} from "@/integrations/_shared/discord/api/guilds";
import { messagesList } from "@/integrations/_shared/discord/api/messages";

/**
 * Bounded, READ-ONLY, COUNT-ONLY + METADATA-ONLY Discord reader for the analytics
 * source (Slice ANALYTICS-SOURCES-DISCORD-1).
 *
 * AUTH: Discord is unusual — every REST call authenticates as the GLOBAL bot token
 * (`DISCORD_BOT_TOKEN`, owned by `_request.ts`), NOT the user OAuth token, and there
 * is NO per-user `refreshAndRetry` path. The user's integration row only gates access
 * (a viewer with no Discord connection gets MISSING_CREDENTIAL upstream in the
 * adapter). The bot can only read guilds it has been added to (403 / Missing Access
 * otherwise — surfaced by the shared wrapper).
 *
 * PRIVACY: this reader reduces channel / message reads to NUMBERS only. From a
 * message it reads ONLY the `timestamp` (projected to epoch ms) and, transiently, the
 * message `id` as a pagination cursor (never returned/stored). It NEVER reads or
 * returns message content, author/username, user ids, attachments, embeds, reactions,
 * mentions, or any raw Discord payload. From a channel it reads only id (transient),
 * name (a structure label), and type. The guild member metric reads ONLY
 * `approximate_member_count` (an aggregate Discord exposes via `?with_counts=true`) —
 * it never lists members.
 *
 * SAFETY — bounded to prevent an unbounded server/channel scan:
 *   - Per-channel paging is capped ({@link CHANNEL_MAX_PAGES} × {@link CHANNEL_PAGE_SIZE}).
 *   - Guild-wide scans additionally cap the TOTAL message-list calls
 *     ({@link GUILD_MAX_CALLS}) and pages per channel ({@link GUILD_CHANNEL_MAX_PAGES}).
 *   - `truncated: true` is reported when a budget is exhausted rather than scanning
 *     the whole server.
 *
 * No raw Discord query comes from widget config — the guild / channel are validated
 * snowflake ids and `limit` / `with_counts` are server-side constants.
 */

export const CHANNEL_PAGE_SIZE = 100; // Discord messages.list hard cap.
/** Single-channel metrics: up to 10 pages = 1000 messages before truncation. */
export const CHANNEL_MAX_PAGES = 10;
/** Guild-wide scans: up to 3 pages per channel before that channel truncates. */
export const GUILD_CHANNEL_MAX_PAGES = 3;
/** Guild-wide scans: total messages.list calls across all channels before truncation. */
export const GUILD_MAX_CALLS = 50;

/** Text-shaped channel types analytics counts (text / announcement / forum). */
const TEXT_SHAPED_CHANNEL_TYPES: ReadonlySet<number> = new Set([
  DISCORD_CHANNEL_TYPE_GUILD_TEXT,
  DISCORD_CHANNEL_TYPE_GUILD_ANNOUNCEMENT,
  DISCORD_CHANNEL_TYPE_GUILD_FORUM,
]);

const UNNAMED_CHANNEL_LABEL = "(unnamed)";

function parseTs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function isTextShaped(type: unknown): boolean {
  return typeof type === "number" && TEXT_SHAPED_CHANNEL_TYPES.has(type);
}

/** Count of text-shaped channels in a guild (1 API call). */
export async function countTextChannels(guildId: string): Promise<number> {
  const all = await guildChannelsList({ guildId });
  return all.filter((c) => isTextShaped(c.type)).length;
}

/**
 * Approximate member count for a guild via `GET /guilds/{id}?with_counts=true`.
 * Reads ONLY `approximate_member_count` (an aggregate) — never lists members.
 * Returns null when Discord omits the field.
 */
export async function getApproximateMemberCount(guildId: string): Promise<number | null> {
  const query = new URLSearchParams();
  query.set("with_counts", "true");
  const guild = await discordBotRequest<{ approximate_member_count?: unknown }>({
    method: "GET",
    path: `/guilds/${encodeURIComponent(guildId)}`,
    query,
    resourceForNotFound: `guild ${guildId}`,
  });
  return typeof guild.approximate_member_count === "number" ? guild.approximate_member_count : null;
}

export interface ChannelScanResult {
  /** Epoch-ms timestamps of messages within [sinceMs, untilMs). Counts only — never content. */
  timestamps: number[];
  /** True when the per-channel page budget was exhausted before reaching the range start. */
  truncated: boolean;
  /** messages.list calls consumed (so guild-wide scans can share a global budget). */
  callsUsed: number;
}

/**
 * Page a single channel newest-first (via `before` cursor), collecting the epoch-ms
 * timestamps of messages within [sinceMs, untilMs). Messages newer than `untilMs` are
 * paged past but not counted; once a message older than `sinceMs` is seen, paging stops
 * (Discord returns newest-first, so everything beyond is older). Bounded by `maxPages`.
 * The message `id` is read transiently only as the pagination cursor — never returned.
 */
export async function scanChannelTimestamps(
  channelId: string,
  sinceMs: number,
  untilMs: number,
  maxPages: number,
): Promise<ChannelScanResult> {
  const timestamps: number[] = [];
  let before: string | undefined;
  let truncated = false;
  let callsUsed = 0;

  for (let page = 0; page < maxPages; page++) {
    const msgs = await messagesList({
      channelId,
      limit: CHANNEL_PAGE_SIZE,
      ...(before ? { before } : {}),
    });
    callsUsed++;
    if (msgs.length === 0) return { timestamps, truncated: false, callsUsed };

    let reachedOlder = false;
    for (const m of msgs) {
      const ts = parseTs(m.timestamp);
      if (ts === null) continue;
      if (ts >= untilMs) continue; // too new — keep paging older
      if (ts < sinceMs) {
        reachedOlder = true;
        continue;
      }
      timestamps.push(ts);
    }

    // newest-first → the oldest message in this page is the last element; use its id
    // as the next `before` cursor (transient — never stored or returned).
    before = msgs[msgs.length - 1]!.id;

    if (reachedOlder) return { timestamps, truncated: false, callsUsed };
    if (msgs.length < CHANNEL_PAGE_SIZE) return { timestamps, truncated: false, callsUsed };
    if (page === maxPages - 1) truncated = true;
  }

  return { timestamps, truncated, callsUsed };
}

export interface GuildChannelCount {
  /** Channel name (a structure label) — fallback when Discord omits the name. */
  name: string;
  /** Messages in range in this channel (count only). */
  count: number;
}

export interface GuildScanResult {
  channels: GuildChannelCount[];
  /** True when the global call budget / a per-channel budget was exhausted. */
  truncated: boolean;
}

/**
 * Scan every text-shaped channel in a guild, counting in-range messages per channel.
 * Bounded by a global {@link GUILD_MAX_CALLS} budget across channels and
 * {@link GUILD_CHANNEL_MAX_PAGES} per channel. Emits only channel NAME (structure
 * label) + COUNT — never message content, ids, or authors.
 */
export async function scanGuildChannelCounts(
  guildId: string,
  sinceMs: number,
  untilMs: number,
): Promise<GuildScanResult> {
  const all = await guildChannelsList({ guildId });
  const text = all.filter((c) => typeof c.id === "string" && c.id.length > 0 && isTextShaped(c.type));

  const channels: GuildChannelCount[] = [];
  let truncated = false;
  let callsLeft = GUILD_MAX_CALLS;

  for (const ch of text) {
    if (callsLeft <= 0) {
      truncated = true;
      break;
    }
    const maxPages = Math.min(GUILD_CHANNEL_MAX_PAGES, callsLeft);
    const r = await scanChannelTimestamps(ch.id, sinceMs, untilMs, maxPages);
    callsLeft -= r.callsUsed;
    if (r.truncated) truncated = true;
    const name = ch.name && ch.name.length > 0 ? ch.name : UNNAMED_CHANNEL_LABEL;
    channels.push({ name, count: r.timestamps.length });
  }

  return { channels, truncated };
}
