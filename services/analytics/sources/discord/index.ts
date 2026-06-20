import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { DiscordApiError, NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import {
  countTextChannels,
  getApproximateMemberCount,
  scanChannelTimestamps,
  scanGuildChannelCounts,
  CHANNEL_MAX_PAGES,
} from "./api";
import { bucketIndexForMs, parseChannelId, parseGuildId, planBuckets } from "./buckets";

/**
 * Discord connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-DISCORD-1).
 *
 * READ-ONLY + COUNT-ONLY + METADATA-ONLY community/chat analytics. Reduces bounded
 * REST reads (guild channel list, message paging, aggregate member count) to numeric
 * aggregates: server channel count, server member count, active-channels count,
 * messages-over-time, messages-by-channel, and per-channel message count. Never
 * executes a workflow node, never takes a raw Discord query from widget config (guild
 * / channel are validated snowflake ids; limits are server-side constants), and never
 * reads a message body, author/username, user id, attachment, embed, reaction, or any
 * raw Discord payload. Approved metrics only.
 *
 * AUTH MODEL (unusual): Discord REST calls authenticate as the GLOBAL bot token
 * (`DISCORD_BOT_TOKEN`), NOT the user OAuth token — so there is NO `refreshAndRetry`
 * here. The reads run directly through the shared bot-token wrappers.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Discord is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) purely to GATE access — a viewer with no
 * Discord connection gets MISSING_CREDENTIAL. The cache layer keys personal providers
 * with `source_user_id = ctx.userId`, so each member's snapshot is distinct (even
 * though the underlying bot-visible data is the same).
 *
 * PRIVACY: only COUNTS + message-timestamp buckets + channel NAMES (structure labels)
 * + an aggregate member count are computed and cached. No message content, message
 * ids, usernames, user ids, member listings, reactions, attachments, embeds, or raw
 * Discord payloads are returned or stored.
 *
 * SCOPES: uses the already-granted bot install + `guilds` scope. No new scope.
 */

const PROVIDER_KEY = "discord";
const GUILD_FILTER = ["discord_guild"] as const;
const GUILD_CHANNEL_FILTER = ["discord_guild", "discord_channel"] as const;
const MAX_CHANNEL_BARS = 12;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "server_channels_count",
    label: "Text channels",
    description: "Text-shaped channels in the selected server.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: GUILD_FILTER,
  },
  {
    key: "server_member_count",
    label: "Server members",
    description: "Approximate member count of the selected server.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: GUILD_FILTER,
  },
  {
    key: "active_channels_count",
    label: "Active channels",
    description: "Channels with at least one message in range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: GUILD_FILTER,
  },
  {
    key: "messages_by_channel",
    label: "Messages by channel",
    description: "Messages per channel in the selected server.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: GUILD_FILTER,
  },
  {
    key: "channel_messages_over_time",
    label: "Messages over time",
    description: "Messages in the selected channel per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: GUILD_CHANNEL_FILTER,
  },
  {
    key: "messages_count",
    label: "Messages",
    description: "Messages in the selected channel over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: GUILD_CHANNEL_FILTER,
  },
];

const CHANNEL_SCOPED_METRICS: ReadonlySet<string> = new Set([
  "channel_messages_over_time",
  "messages_count",
]);

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Discord read into a typed, leak-free AnalyticsSourceError. */
function classifyDiscordError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Discord before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't find that Discord server or channel. Re-pick it.",
      "INVALID_QUERY",
    );
  }
  if (err instanceof DiscordApiError) {
    if (err.status === 429) {
      return new AnalyticsSourceError("Discord's rate limit was reached. Try again shortly.", "RATE_LIMITED");
    }
    if (err.status === 403) {
      return new AnalyticsSourceError(
        "ChainReact's Discord bot isn't in that server or can't read it. Re-add the bot, then try again.",
        "INVALID_QUERY",
      );
    }
    // 401 (bot token), 5xx, etc. — not user-fixable; generic safe message.
    return new AnalyticsSourceError("Couldn't load Discord data.", "PROVIDER_ERROR");
  }
  // DiscordBotTokenMissingError (deploy misconfig) + anything else — no raw leak.
  return new AnalyticsSourceError("Couldn't load Discord data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Discord connection to gate access (or MISSING_CREDENTIAL). */
async function requireOwnDiscord(ctx: AnalyticsSourceContext): Promise<void> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Discord to use this widget.", "MISSING_CREDENTIAL");
  }
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of this server — it has more channels/messages than a single widget scans."]
    : [];
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

function seriesResult(
  dimension: string,
  rows: ReadonlyArray<{ label: string; count: number }>,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: [dimension],
    measures: ["count"],
    rows: rows.map((r) => ({ [dimension]: r.label, count: r.count })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const discordAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Discord",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Discord metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the required filter snowflakes server-side BEFORE any I/O.
    let guildId: string;
    let channelId: string | null = null;
    try {
      guildId = parseGuildId(query.filters?.discord_guild);
      if (CHANNEL_SCOPED_METRICS.has(query.metricKey)) {
        channelId = parseChannelId(query.filters?.discord_channel);
      }
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Discord server / channel.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    await requireOwnDiscord(ctx);

    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);

    try {
      // ── Server scalars (no range) ─────────────────────────────────────────
      if (query.metricKey === "server_channels_count") {
        const count = await countTextChannels(guildId);
        return scalarResult("server_channels_count", count, generatedAt, [], false);
      }
      if (query.metricKey === "server_member_count") {
        const count = (await getApproximateMemberCount(guildId)) ?? 0;
        return scalarResult("server_member_count", count, generatedAt, [], false);
      }

      // ── Channel scalar: messages in range ─────────────────────────────────
      if (query.metricKey === "messages_count") {
        const scan = await scanChannelTimestamps(channelId!, sinceMs, untilMs, CHANNEL_MAX_PAGES);
        return scalarResult(
          "messages_count",
          scan.timestamps.length,
          generatedAt,
          truncationWarning(scan.truncated),
          scan.truncated,
        );
      }

      // ── Channel series: messages over time ────────────────────────────────
      if (query.metricKey === "channel_messages_over_time") {
        const scan = await scanChannelTimestamps(channelId!, sinceMs, untilMs, CHANNEL_MAX_PAGES);
        const buckets = planBuckets(query.range.since, query.range.until);
        if (buckets.length === 0) {
          return seriesResult("date", [], generatedAt, ["The selected date range is empty or invalid."], scan.truncated);
        }
        const counts = new Array<number>(buckets.length).fill(0);
        for (const ts of scan.timestamps) {
          const idx = bucketIndexForMs(buckets, ts);
          if (idx >= 0) counts[idx]! += 1;
        }
        const rows = buckets.map((b, i) => ({ label: b.key, count: counts[i] ?? 0 }));
        return seriesResult("date", rows, generatedAt, truncationWarning(scan.truncated), scan.truncated);
      }

      // ── Guild-wide scans (active channels / messages by channel) ──────────
      const guildScan = await scanGuildChannelCounts(guildId, sinceMs, untilMs);
      if (query.metricKey === "active_channels_count") {
        const active = guildScan.channels.filter((c) => c.count > 0).length;
        return scalarResult(
          "active_channels_count",
          active,
          generatedAt,
          truncationWarning(guildScan.truncated),
          guildScan.truncated,
        );
      }

      // messages_by_channel — top channels by count (channel-name labels only).
      const rows = [...guildScan.channels]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_CHANNEL_BARS)
        .map((c) => ({ label: c.name, count: c.count }));
      return seriesResult("channel", rows, generatedAt, truncationWarning(guildScan.truncated), guildScan.truncated);
    } catch (err) {
      throw classifyDiscordError(err);
    }
  },
};
