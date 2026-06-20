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
  OneNoteRateLimitError,
  countNotebooks,
  countSections,
  scanPageTimestamps,
  type PageFact,
} from "./api";
import { bucketIndexForMs, planBuckets } from "./buckets";

/**
 * Microsoft OneNote connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-ONENOTE-1).
 *
 * READ-ONLY + COUNT-ONLY + METADATA-ONLY. Reduces bounded Microsoft Graph reads
 * (account-wide `me/onenote/{notebooks,sections,pages}`) to numeric aggregates:
 * notebook / section / page counts + pages created/modified over time. Never executes a
 * workflow node, never takes a raw Graph query from widget config (these are fixed
 * `me/onenote/*` reads with server-side `$select`/`$top`; there are NO widget filters),
 * and never reads a page title, content, preview text, contentUrl, webUrl, attachment,
 * comment, or author. Approved metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * OneNote is PERSONAL + REFRESHABLE (delegated-user Graph token). This resolves the
 * REQUESTING USER'S OWN connection (`connected_by_user_id = ctx.userId`) and pins
 * refresh/retry to that row — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`, so each member's snapshot is distinct.
 * No connection → MISSING_CREDENTIAL. Reads run through `refreshAndRetry`.
 *
 * PRIVACY: only COUNTS + page created/modified date buckets are computed and cached. No
 * page titles, content, preview text, links, attachments, authors, or raw Graph payloads
 * are returned or stored.
 *
 * SCOPES: uses the already-granted `Notes.ReadWrite` scope (includes read). No new scope.
 */

const PROVIDER_KEY = "microsoft-onenote";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "notebooks_count",
    label: "Notebooks",
    description: "Your OneNote notebooks.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "sections_count",
    label: "Sections",
    description: "Sections across your OneNote notebooks.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "pages_count",
    label: "Pages",
    description: "Pages across your OneNote notebooks.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "pages_created_over_time",
    label: "Pages created over time",
    description: "Pages created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "pages_modified_over_time",
    label: "Pages modified over time",
    description: "Pages modified per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

const PAGE_SCAN_METRICS: ReadonlySet<string> = new Set([
  "pages_count",
  "pages_created_over_time",
  "pages_modified_over_time",
]);

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a OneNote read into a typed, leak-free AnalyticsSourceError. */
function classifyOneNoteError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect OneNote before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof OneNoteRateLimitError) {
    return new AnalyticsSourceError("OneNote's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // NotFoundError (no OneNote provisioned) + anything else — generic, safe message; no
  // raw Graph body / token / payload leaks.
  return new AnalyticsSourceError("Couldn't load OneNote data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN OneNote connection (or MISSING_CREDENTIAL). */
async function resolveOwnOneNote(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect OneNote to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of your OneNote — you have more than a single widget scans."]
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

function bucketSeries(
  facts: readonly PageFact[],
  pick: (f: PageFact) => number | null,
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
  return seriesResult(rows, generatedAt, truncationWarning(truncated), truncated);
}

export const microsoftOneNoteAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Microsoft OneNote",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown OneNote metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnOneNote(ctx);

    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Collection count scalars ──────────────────────────────────────────
      if (query.metricKey === "notebooks_count") {
        const r = await run((t) => countNotebooks(t));
        return scalarResult("notebooks_count", r.count, generatedAt, truncationWarning(r.truncated), r.truncated);
      }
      if (query.metricKey === "sections_count") {
        const r = await run((t) => countSections(t));
        return scalarResult("sections_count", r.count, generatedAt, truncationWarning(r.truncated), r.truncated);
      }

      // ── Page metrics (shared account-wide page scan) ──────────────────────
      if (PAGE_SCAN_METRICS.has(query.metricKey)) {
        const scan = await run((t) => scanPageTimestamps(t));
        if (query.metricKey === "pages_count") {
          return scalarResult(
            "pages_count",
            scan.facts.length,
            generatedAt,
            truncationWarning(scan.truncated),
            scan.truncated,
          );
        }
        const pick =
          query.metricKey === "pages_created_over_time"
            ? (f: PageFact) => f.createdMs
            : (f: PageFact) => f.modifiedMs;
        return bucketSeries(scan.facts, pick, query.range, generatedAt, scan.truncated);
      }

      // Unreachable — METRICS is exhaustive above.
      throw new AnalyticsSourceError(`Unknown OneNote metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    } catch (err) {
      throw classifyOneNoteError(err);
    }
  },
};
