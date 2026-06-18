import { getActiveForExecution } from "@/repositories/integrations";
import { decryptToken } from "@/core/encryption/tokens";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { searchIssueCount } from "./api";
import {
  openCountSearchQuery,
  parseRepoRef,
  planBuckets,
  seriesSearchQuery,
  type GithubSeriesMetric,
  type RepoRef,
} from "./buckets";

/**
 * GitHub connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-GITHUB-1).
 *
 * READ-ONLY. Uses the GitHub Search API (`total_count`, no pagination) for a
 * bounded set of metrics over ONE repository (validated `owner/name`). Never
 * executes a workflow node, never takes a raw token from widget config, never
 * accepts an arbitrary URL/method.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * GitHub is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * within the active account (`connected_by_user_id = ctx.userId`) — never a
 * co-member's. A user with no GitHub connection gets a typed MISSING_CREDENTIAL
 * error (the widget shows "connect GitHub"), not another member's data and not a
 * crash. GitHub tokens are non-refreshable, so a 401 → MISSING_CREDENTIAL
 * (reconnect), with no refresh attempt.
 *
 * SCOPES: uses only the already-granted `repo` scope (private+public issues/PRs).
 * No new scope is requested.
 */

const PROVIDER_KEY = "github";

const SERIES_METRICS = new Set<GithubSeriesMetric>([
  "issues_opened",
  "prs_opened",
  "prs_merged",
]);

const METRICS: readonly AnalyticsSourceMetric[] = [
  { key: "open_issues", label: "Open issues", description: "Current open issues in the repository.", visualizations: ["scalar"], supportedGroupBy: [], supportedFilters: ["repo"] },
  { key: "open_prs", label: "Open pull requests", description: "Current open PRs in the repository.", visualizations: ["scalar"], supportedGroupBy: [], supportedFilters: ["repo"] },
  { key: "issues_opened", label: "Issues opened over time", description: "Issues created per time bucket.", visualizations: ["series"], supportedGroupBy: ["day", "week", "month"], supportedFilters: ["repo"] },
  { key: "prs_opened", label: "Pull requests opened over time", description: "PRs created per time bucket.", visualizations: ["series"], supportedGroupBy: ["day", "week", "month"], supportedFilters: ["repo"] },
  { key: "prs_merged", label: "Pull requests merged over time", description: "PRs merged per time bucket.", visualizations: ["series"], supportedGroupBy: ["day", "week", "month"], supportedFilters: ["repo"] },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a GitHub read into a typed, leak-free AnalyticsSourceError. */
function classifyGithubError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Your GitHub connection needs to be reconnected.",
      "MISSING_CREDENTIAL",
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(msg)) {
    return new AnalyticsSourceError(
      "GitHub's rate limit was reached. Try again shortly.",
      "RATE_LIMITED",
    );
  }
  // No raw provider text leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load GitHub data.", "PROVIDER_ERROR");
}

/** Validate the `repo` filter into a safe RepoRef, or throw INVALID_QUERY. */
function repoFromQuery(query: AnalyticsSourceQuery): RepoRef {
  try {
    return parseRepoRef(query.filters?.repo);
  } catch (err) {
    throw new AnalyticsSourceError(
      err instanceof Error ? err.message : "Invalid repository filter.",
      "INVALID_QUERY",
    );
  }
}

/** Resolve the requesting user's own GitHub access token (or MISSING_CREDENTIAL). */
async function resolveOwnGithubToken(ctx: AnalyticsSourceContext): Promise<string> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError(
      "Connect your GitHub account to use this widget.",
      "MISSING_CREDENTIAL",
    );
  }
  try {
    return decryptToken(integration.accessTokenEncrypted);
  } catch {
    throw new AnalyticsSourceError(
      "Your GitHub connection needs to be reconnected.",
      "MISSING_CREDENTIAL",
    );
  }
}

export const githubAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "GitHub",
  connectedApp: true,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(
        `Unknown GitHub metric: ${query.metricKey}`,
        "UNKNOWN_METRIC",
      );
    }

    // Validate the repo filter (server-side allow-listed shape) BEFORE any I/O.
    const repo = repoFromQuery(query);

    const token = await resolveOwnGithubToken(ctx);
    const generatedAt = new Date().toISOString();
    const warnings: string[] = [];

    const runSearch = async (q: string): Promise<number> => {
      try {
        const { total, incomplete } = await searchIssueCount(token, q);
        if (incomplete) warnings.push("Some GitHub results may be incomplete (search timed out).");
        return total;
      } catch (err) {
        throw classifyGithubError(err);
      }
    };

    // ── Scalars ──────────────────────────────────────────────────────────────
    if (query.metricKey === "open_issues" || query.metricKey === "open_prs") {
      const total = await runSearch(openCountSearchQuery(query.metricKey, repo));
      return {
        shape: "scalar",
        dimensions: [],
        measures: [query.metricKey],
        rows: [{ [query.metricKey]: total }],
        totals: { [query.metricKey]: total },
        generatedAt,
        freshness: liveFreshness(),
        warnings,
        truncated: false,
      };
    }

    // ── Series (one bounded search per capped time bucket) ────────────────────
    const seriesMetric = query.metricKey as GithubSeriesMetric;
    if (!SERIES_METRICS.has(seriesMetric)) {
      // Defensive — METRICS is the source of truth; this is unreachable.
      throw new AnalyticsSourceError(`Unsupported GitHub metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return {
        shape: "series",
        dimensions: ["date"],
        measures: ["count"],
        rows: [],
        totals: { count: 0 },
        generatedAt,
        freshness: liveFreshness(),
        warnings: ["The selected date range is empty or invalid."],
        truncated: false,
      };
    }

    const rows: Array<Record<string, string | number | null>> = [];
    let sum = 0;
    for (const bucket of buckets) {
      const count = await runSearch(seriesSearchQuery(seriesMetric, repo, bucket));
      rows.push({ date: bucket.key, count });
      sum += count;
    }
    return {
      shape: "series",
      dimensions: ["date"],
      measures: ["count"],
      rows,
      totals: { count: sum },
      generatedAt,
      freshness: liveFreshness(),
      warnings,
      truncated: false,
    };
  },
};
