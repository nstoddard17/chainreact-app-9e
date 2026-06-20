import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import {
  TeamsRateLimitError,
  listTeamChannels,
  scanChannelTimestamps,
  scanTeamChannelCounts,
  CHANNEL_MAX_PAGES,
} from "./api";
import { bucketIndexForMs, parseChannelId, parseTeamId, planBuckets } from "./buckets";

/**
 * Microsoft Teams connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-TEAMS-1).
 *
 * READ-ONLY + COUNT-ONLY + METADATA-ONLY chat/collaboration analytics. Reduces bounded
 * Microsoft Graph reads (team channel list, channel message paging) to numeric
 * aggregates: team channel count, active-channels count, messages-over-time,
 * messages-by-channel, and per-channel message count. Never executes a workflow node,
 * never takes a raw Graph query from widget config (team / channel are validated Graph
 * ids; `$select`/`$top` are server-side constants), and never reads a message body,
 * subject, from/user details, message id, reaction, attachment, mention, hostedContent,
 * or webUrl. Approved metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Teams is PERSONAL + REFRESHABLE (delegated-user Graph token). This resolves the
 * REQUESTING USER'S OWN connection (`connected_by_user_id = ctx.userId`) and pins
 * refresh/retry to that row's `providerAccountId` — never a co-member's. The cache
 * layer keys personal providers with `source_user_id = ctx.userId`, so each member's
 * snapshot is distinct. No connection → MISSING_CREDENTIAL. Reads run through
 * `refreshAndRetry` (unlike Discord's global bot token).
 *
 * PRIVACY: only COUNTS + message-timestamp buckets + channel NAMES (structure labels)
 * are computed and cached. No message content, subjects, message ids, usernames, user
 * ids, member listings, reactions, attachments, mentions, hostedContents, webUrls, or
 * raw Graph payloads are returned or stored.
 *
 * SCOPES: uses the already-granted `Channel.ReadBasic.All` (channel list) +
 * `ChannelMessage.Read.All` (channel messages). No new scope.
 */

const PROVIDER_KEY = "microsoft-teams";
const TEAM_FILTER = ["teams_team"] as const;
const TEAM_CHANNEL_FILTER = ["teams_team", "teams_channel"] as const;
const MAX_CHANNEL_BARS = 12;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "team_channels_count",
    label: "Channels",
    description: "Channels in the selected team.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: TEAM_FILTER,
  },
  {
    key: "active_channels_count",
    label: "Active channels",
    description: "Channels with at least one message in range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: TEAM_FILTER,
  },
  {
    key: "messages_by_channel",
    label: "Messages by channel",
    description: "Messages per channel in the selected team.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: TEAM_FILTER,
  },
  {
    key: "channel_messages_over_time",
    label: "Messages over time",
    description: "Messages in the selected channel per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: TEAM_CHANNEL_FILTER,
  },
  {
    key: "channel_messages_count",
    label: "Messages",
    description: "Messages in the selected channel over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: TEAM_CHANNEL_FILTER,
  },
];

const CHANNEL_SCOPED_METRICS: ReadonlySet<string> = new Set([
  "channel_messages_over_time",
  "channel_messages_count",
]);

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Teams read into a typed, leak-free AnalyticsSourceError. */
function classifyTeamsError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Microsoft Teams before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof TeamsRateLimitError) {
    return new AnalyticsSourceError("Microsoft Teams' rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't find that Teams team or channel. Re-pick it.",
      "INVALID_QUERY",
    );
  }
  // No raw Graph error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Microsoft Teams data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Teams connection (or MISSING_CREDENTIAL). */
async function resolveOwnTeams(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Microsoft Teams to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of this team — it has more channels/messages than a single widget scans."]
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

export const microsoftTeamsAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Microsoft Teams",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Microsoft Teams metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the required filter ids server-side BEFORE any I/O.
    let teamId: string;
    let channelId: string | null = null;
    try {
      teamId = parseTeamId(query.filters?.teams_team);
      if (CHANNEL_SCOPED_METRICS.has(query.metricKey)) {
        channelId = parseChannelId(query.filters?.teams_channel);
      }
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Microsoft Teams team / channel.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnTeams(ctx);

    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);

    try {
      // ── Team channel count (no range) ─────────────────────────────────────
      if (query.metricKey === "team_channels_count") {
        const list = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: PROVIDER_KEY,
          providerAccountId,
          apiCall: (token: string) => listTeamChannels(token, teamId),
        });
        return scalarResult(
          "team_channels_count",
          list.channels.length,
          generatedAt,
          truncationWarning(list.truncated),
          list.truncated,
        );
      }

      // ── Channel scalar: messages in range ─────────────────────────────────
      if (query.metricKey === "channel_messages_count") {
        const scan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: PROVIDER_KEY,
          providerAccountId,
          apiCall: (token: string) =>
            scanChannelTimestamps(token, teamId, channelId!, sinceMs, untilMs, CHANNEL_MAX_PAGES),
        });
        return scalarResult(
          "channel_messages_count",
          scan.timestamps.length,
          generatedAt,
          truncationWarning(scan.truncated),
          scan.truncated,
        );
      }

      // ── Channel series: messages over time ────────────────────────────────
      if (query.metricKey === "channel_messages_over_time") {
        const scan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: PROVIDER_KEY,
          providerAccountId,
          apiCall: (token: string) =>
            scanChannelTimestamps(token, teamId, channelId!, sinceMs, untilMs, CHANNEL_MAX_PAGES),
        });
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

      // ── Team-wide scans (active channels / messages by channel) ───────────
      const teamScan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId,
        apiCall: (token: string) => scanTeamChannelCounts(token, teamId, sinceMs, untilMs),
      });
      if (query.metricKey === "active_channels_count") {
        const active = teamScan.channels.filter((c) => c.count > 0).length;
        return scalarResult(
          "active_channels_count",
          active,
          generatedAt,
          truncationWarning(teamScan.truncated),
          teamScan.truncated,
        );
      }

      // messages_by_channel — top channels by count (channel-name labels only).
      const rows = [...teamScan.channels]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_CHANNEL_BARS)
        .map((c) => ({ label: c.name, count: c.count }));
      return seriesResult("channel", rows, generatedAt, truncationWarning(teamScan.truncated), teamScan.truncated);
    } catch (err) {
      throw classifyTeamsError(err);
    }
  },
};
