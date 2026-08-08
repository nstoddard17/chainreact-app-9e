import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import {
  GoogleWorkspaceRateLimitError,
  scanWorkspaceFiles,
  type WorkspaceFileFact,
} from "./googleWorkspaceFiles";
import { bucketIndexForMs, planBuckets } from "./googleWorkspaceBuckets";

/**
 * Factory that builds a Google Workspace file analytics adapter for ONE Workspace type
 * (Google Docs / Google Sheets) — Slice ANALYTICS-SOURCES-GWORKSPACE-1. Both providers
 * share the same flat, metadata-only Drive `files.list` scan
 * ({@link scanWorkspaceFiles}); this factory keeps their provider keys + metric names
 * separate while collapsing the logic into one place.
 *
 * READ-ONLY + METADATA-ONLY + COUNT-ONLY. Reduces a bounded MIME-filtered flat list to
 * numeric aggregates: a file count + files-created/modified over time. Never executes a
 * workflow node, never takes a raw Drive query from widget config (the MIME type is a
 * server-side constant, there are no widget filters), and never reads a file name,
 * content, owner, permission, or any raw Drive payload. Approved metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Docs/Sheets are PERSONAL + REFRESHABLE. Resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins refresh/retry to that row — never a
 * co-member's. The cache layer keys personal providers with `source_user_id =
 * ctx.userId`. No connection → MISSING_CREDENTIAL. Reads run through `refreshAndRetry`.
 */

export interface WorkspaceFilesAdapterConfig {
  /** Provider key — "google-docs" / "google-sheets". */
  providerKey: string;
  displayName: string;
  /** Google Workspace MIME type to filter on (server-side constant). */
  mimeType: string;
  /** Metric keys (provider-specific names: documents_* / spreadsheets_*). */
  countMetric: string;
  modifiedMetric: string;
  createdMetric: string;
  /** Labels for the metric catalog. */
  countLabel: string;
  modifiedLabel: string;
  createdLabel: string;
  /** Human noun for warnings ("document" / "spreadsheet"). */
  noun: string;
  /** Connect-CTA noun ("Google Docs" / "Google Sheets"). */
  connectNoun: string;
  /**
   * Drive scopes that authorize this dataset's whole-corpus `files.list` scan.
   * The connection must hold AT LEAST ONE of them
   * (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
   *
   * This exists because the scan answers "how many <noun>s do you have" — a
   * TOTAL. Under a narrow per-file grant (`drive.file`) `files.list` silently
   * returns only the handful of files the user picked for a workflow, which
   * would render as a confident, wrong total. When no listed scope is granted
   * the dataset reports SCOPE_UNAVAILABLE instead of scanning.
   */
  scanScopes: readonly string[];
}

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

function truncationWarning(cfg: WorkspaceFilesAdapterConfig, truncated: boolean): string[] {
  return truncated
    ? [`Based on part of your ${cfg.noun}s — you have more than a single widget scans.`]
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
  rows: ReadonlyArray<{ date: string; count: number }>,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: rows.map((r) => ({ date: r.date, count: r.count })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

/** Bucket a list of timestamps into the planned day buckets. */
function bucketSeries(
  facts: readonly WorkspaceFileFact[],
  pick: (f: WorkspaceFileFact) => number | null,
  range: { since: string; until: string },
  generatedAt: string,
  truncated: boolean,
): NormalizedAnalyticsResult {
  const buckets = planBuckets(range.since, range.until);
  if (buckets.length === 0) {
    return seriesResult([], generatedAt, ["The selected date range is empty or invalid."], truncated);
  }
  const counts = new Array<number>(buckets.length).fill(0);
  for (const f of facts) {
    const idx = bucketIndexForMs(buckets, pick(f));
    if (idx >= 0) counts[idx]! += 1;
  }
  const rows = buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 }));
  return seriesResult(rows, generatedAt, [], truncated);
}

export function createWorkspaceFilesAnalyticsSource(
  cfg: WorkspaceFilesAdapterConfig,
): AnalyticsSourceAdapter {
  const metrics: readonly AnalyticsSourceMetric[] = [
    {
      key: cfg.countMetric,
      label: cfg.countLabel,
      description: `All accessible ${cfg.noun}s in your Google Drive.`,
      visualizations: ["scalar"],
      supportedGroupBy: [],
      supportedFilters: [],
    },
    {
      key: cfg.modifiedMetric,
      label: cfg.modifiedLabel,
      description: `${cfg.noun[0]!.toUpperCase()}${cfg.noun.slice(1)}s modified per time bucket.`,
      visualizations: ["series"],
      supportedGroupBy: [],
      supportedFilters: [],
    },
    {
      key: cfg.createdMetric,
      label: cfg.createdLabel,
      description: `${cfg.noun[0]!.toUpperCase()}${cfg.noun.slice(1)}s created per time bucket.`,
      visualizations: ["series"],
      supportedGroupBy: [],
      supportedFilters: [],
    },
  ];

  function classifyError(err: unknown): AnalyticsSourceError {
    if (err instanceof AnalyticsSourceError) return err;
    if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
      return new AnalyticsSourceError(`Reconnect ${cfg.connectNoun} before this widget can load.`, "MISSING_CREDENTIAL");
    }
    if (err instanceof GoogleWorkspaceRateLimitError) {
      return new AnalyticsSourceError("Google Drive's rate limit was reached. Try again shortly.", "RATE_LIMITED");
    }
    return new AnalyticsSourceError(`Couldn't load ${cfg.connectNoun} data.`, "PROVIDER_ERROR");
  }

  async function resolveOwn(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
    const integration = await getActiveForExecution(ctx.accountId, cfg.providerKey, null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) {
      throw new AnalyticsSourceError(`Connect ${cfg.connectNoun} to use this widget.`, "MISSING_CREDENTIAL");
    }

    // Scope-aware honest degradation. Read the ACTUAL granted scopes on the
    // row — never the manifest, which describes what NEW connections request
    // and would misjudge every historical connection. A connection granted
    // only per-file Drive access cannot see the user's whole corpus, so there
    // is no accurate total to report and we must not scan.
    const granted = new Set(integration.scopes ?? []);
    if (!cfg.scanScopes.some((s) => granted.has(s))) {
      throw new AnalyticsSourceError(
        `${cfg.connectNoun} account analytics aren't available for this connection, ` +
          `because ChainReact now uses resource-specific Google Drive access — ` +
          `it can see the files you pick for workflows, not your whole Drive. ` +
          `Your ${cfg.noun} workflows are unaffected.`,
        "SCOPE_UNAVAILABLE",
      );
    }

    return { providerAccountId: integration.providerAccountId };
  }

  return {
    providerKey: cfg.providerKey,
    displayName: cfg.displayName,
    connectedApp: true,
    cacheTtlSeconds: 600,
    metrics,

    async query(
      query: AnalyticsSourceQuery,
      ctx: AnalyticsSourceContext,
    ): Promise<NormalizedAnalyticsResult> {
      const metric = metrics.find((m) => m.key === query.metricKey);
      if (!metric) {
        throw new AnalyticsSourceError(`Unknown ${cfg.connectNoun} metric: ${query.metricKey}`, "UNKNOWN_METRIC");
      }

      const generatedAt = new Date().toISOString();
      const { providerAccountId } = await resolveOwn(ctx);

      let scan;
      try {
        scan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: cfg.providerKey,
          providerAccountId,
          apiCall: (accessToken: string) => scanWorkspaceFiles(accessToken, cfg.mimeType),
        });
      } catch (err) {
        throw classifyError(err);
      }

      const facts: readonly WorkspaceFileFact[] = scan.facts;
      const warnings = truncationWarning(cfg, scan.truncated);

      if (query.metricKey === cfg.countMetric) {
        return scalarResult(cfg.countMetric, facts.length, generatedAt, warnings, scan.truncated);
      }
      if (query.metricKey === cfg.modifiedMetric) {
        return bucketSeries(facts, (f) => f.modifiedMs, query.range, generatedAt, scan.truncated);
      }
      // createdMetric
      return bucketSeries(facts, (f) => f.createdMs, query.range, generatedAt, scan.truncated);
    },
  };
}
