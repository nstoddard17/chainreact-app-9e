import { getActiveForExecution } from "@/repositories/integrations";
import { decryptToken } from "@/core/encryption/tokens";
import { SlackApiError, isSlackAuthError } from "@/integrations/slack/api/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { fetchChannelHistory, MAX_MESSAGES, type SlackMessage } from "./api";
import {
  bucketIndexForMs,
  isoToSlackTs,
  parseChannelRef,
  parseKeyword,
  planBuckets,
  slackTsToMs,
  type SlackTimeBucket,
} from "./buckets";

/**
 * Slack connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-SLACK-1).
 *
 * READ-ONLY. Reads a BOUNDED window of one channel's `conversations.history` and
 * reduces it to numeric aggregates. Never executes a workflow node, never takes a
 * raw token from widget config, never accepts an arbitrary Slack method or search
 * syntax. Approved metrics only (validated against the registry upstream).
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * Slack is an ACCOUNT-shared workspace bot token, so this resolves the ACCOUNT'S
 * Slack connection (no per-user pin) — every account member sees the SAME
 * workspace data. The cache layer keys account-shared providers with
 * `source_user_id = null` automatically, so there is no per-member snapshot and
 * no personal-credential cross-leak to guard here (unlike GitHub). Slack bot
 * tokens are non-refreshable → an auth failure maps to MISSING_CREDENTIAL
 * (reconnect), never a refresh attempt.
 *
 * PRIVACY: only public/private channels the bot is a member of are reachable; DM
 * ids are rejected at validation. Message text is read transiently server-side
 * ONLY to count keyword matches — no message content or author identity is ever
 * returned to the client or stored. Only the normalized counts are cached.
 *
 * SCOPES: uses already-granted `channels:history` / `groups:history`. No new
 * scope is requested.
 */

const PROVIDER_KEY = "slack";

/**
 * Channel-lifecycle / system rows that aren't real messages. Excluded so the
 * counts represent actual channel activity, not joins/renames/etc.
 */
const SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "bot_add",
  "bot_remove",
  "pinned_item",
  "unpinned_item",
]);

function isContentMessage(m: SlackMessage): boolean {
  return m.subtype === undefined || !SYSTEM_SUBTYPES.has(m.subtype);
}

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "channel_activity_count",
    label: "Messages in channel",
    description: "Total messages posted in the channel over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: ["channel"],
  },
  {
    key: "active_users_count",
    label: "Active people in channel",
    description: "Distinct people who posted in the channel over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: ["channel"],
  },
  {
    key: "messages_over_time",
    label: "Messages over time",
    description: "Messages posted per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: ["day", "week", "month"],
    supportedFilters: ["channel"],
  },
  {
    key: "keyword_mentions",
    label: "Keyword mentions over time",
    description: "Messages containing a keyword per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: ["day", "week", "month"],
    supportedFilters: ["channel", "keyword"],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Slack read into a typed, leak-free AnalyticsSourceError. */
function classifySlackError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof SlackApiError) {
    const code = err.slackErrorCode;
    if (isSlackAuthError(code)) {
      return new AnalyticsSourceError(
        "Slack needs to be reconnected before this widget can load.",
        "MISSING_CREDENTIAL",
      );
    }
    if (code === "ratelimited" || code === "http_429") {
      return new AnalyticsSourceError(
        "Slack's rate limit was reached. Try again shortly.",
        "RATE_LIMITED",
      );
    }
    if (code === "channel_not_found" || code === "not_in_channel") {
      // User-fixable config problem — clear, but never echoes the raw code.
      return new AnalyticsSourceError(
        "ChainReact can't read that Slack channel. Add the ChainReact app to the channel, then try again.",
        "PROVIDER_ERROR",
      );
    }
    // No raw Slack error code leaks — a generic, safe message.
    return new AnalyticsSourceError("Couldn't load Slack data.", "PROVIDER_ERROR");
  }
  return new AnalyticsSourceError("Couldn't load Slack data.", "PROVIDER_ERROR");
}

/** Resolve the ACCOUNT'S Slack bot token (account-shared), or MISSING_CREDENTIAL. */
async function resolveAccountSlackToken(ctx: AnalyticsSourceContext): Promise<string> {
  // No connectedByUserId pin — Slack is account-shared (workspace bot token).
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  if (!integration) {
    throw new AnalyticsSourceError(
      "Connect Slack to use this widget.",
      "MISSING_CREDENTIAL",
    );
  }
  try {
    return decryptToken(integration.accessTokenEncrypted);
  } catch {
    throw new AnalyticsSourceError(
      "Slack needs to be reconnected before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Showing the most recent ${MAX_MESSAGES} messages — the channel had more activity in this range.`]
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
  buckets: readonly SlackTimeBucket[],
  counts: readonly number[],
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  const rows = buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 }));
  const sum = counts.reduce((a, b) => a + b, 0);
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows,
    totals: { count: sum },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const slackAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Slack",
  connectedApp: true,
  // conversations.history is Tier 3 (~50 req/min) and a query makes ≤10 calls;
  // cache 10 min so repeated dashboard loads don't re-page the channel.
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(
        `Unknown Slack metric: ${query.metricKey}`,
        "UNKNOWN_METRIC",
      );
    }

    // Validate filters server-side BEFORE any I/O (INVALID_QUERY on failure).
    let channel: string;
    try {
      channel = parseChannelRef(query.filters?.channel);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Slack channel.",
        "INVALID_QUERY",
      );
    }

    let keyword: string | null = null;
    if (query.metricKey === "keyword_mentions") {
      try {
        keyword = parseKeyword(query.filters?.keyword);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Enter a keyword.",
          "INVALID_QUERY",
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const buckets = planBuckets(query.range.since, query.range.until);

    const token = await resolveAccountSlackToken(ctx);

    let history;
    try {
      history = await fetchChannelHistory(
        token,
        channel,
        isoToSlackTs(query.range.since),
        isoToSlackTs(query.range.until),
      );
    } catch (err) {
      throw classifySlackError(err);
    }

    const warnings = truncationWarnings(history.truncated);
    const content = history.messages.filter(isContentMessage);

    // ── Scalars ──────────────────────────────────────────────────────────────
    if (query.metricKey === "channel_activity_count") {
      return scalarResult("channel_activity_count", content.length, generatedAt, warnings, history.truncated);
    }
    if (query.metricKey === "active_users_count") {
      const users = new Set<string>();
      for (const m of content) if (m.user) users.add(m.user);
      return scalarResult("active_users_count", users.size, generatedAt, warnings, history.truncated);
    }

    // ── Series (bucket the in-window messages) ────────────────────────────────
    if (buckets.length === 0) {
      return {
        shape: "series",
        dimensions: ["date"],
        measures: ["count"],
        rows: [],
        totals: { count: 0 },
        generatedAt,
        freshness: liveFreshness(),
        warnings: [...warnings, "The selected date range is empty or invalid."],
        truncated: history.truncated,
      };
    }

    const counts = new Array<number>(buckets.length).fill(0);
    const lowerKeyword = keyword ? keyword.toLowerCase() : null;
    for (const m of content) {
      if (lowerKeyword !== null) {
        if (typeof m.text !== "string" || !m.text.toLowerCase().includes(lowerKeyword)) {
          continue;
        }
      }
      const ms = slackTsToMs(m.ts);
      if (ms === null) continue;
      const idx = bucketIndexForMs(buckets, ms);
      if (idx >= 0) counts[idx]! += 1;
    }

    return seriesResult(buckets, counts, generatedAt, warnings, history.truncated);
  },
};
