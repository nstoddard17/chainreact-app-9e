import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { worksheetsList } from "@/integrations/microsoft-excel/api/worksheetsList";
import { tablesList } from "@/integrations/microsoft-excel/api/tablesList";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { ExcelRateLimitError, scanWorkbooks, type WorkbookFact } from "./api";
import { bucketIndexForMs, parseWorkbookId, planBuckets } from "./buckets";

/**
 * Microsoft Excel connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-EXCEL-1).
 *
 * READ-ONLY + COUNT-ONLY + METADATA-ONLY workbook analytics. Reduces bounded Microsoft
 * Graph reads to numeric aggregates:
 *   - Account-wide (no picker): workbook count + workbooks created/modified over time,
 *     from a whole-drive `.xlsx` metadata search ({@link scanWorkbooks}).
 *   - Workbook-scoped (workbook picker): worksheet count + table count, from the existing
 *     metadata-only `worksheetsList` / `tablesList` wrappers (id/name lists — only the
 *     COUNT is used; names are discarded).
 * Never executes a workflow node, never takes a raw Graph query from widget config (the
 * workbook is a validated DriveItem id; the MIME / search term / $select are server-side
 * constants), and never reads a worksheet cell value, formula, range, usedRange, table
 * row, chart/pivot, file name, webUrl, owner, or sharing link. Approved metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Excel is PERSONAL + REFRESHABLE (delegated-user Graph token). This resolves the
 * REQUESTING USER'S OWN connection (`connected_by_user_id = ctx.userId`) and pins
 * refresh/retry to that row — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`. No connection → MISSING_CREDENTIAL.
 *
 * PRIVACY: only COUNTS + workbook created/modified date buckets are computed and cached.
 * No workbook contents, cell values, formulas, table rows, file names, owners, or raw
 * Graph payloads are returned or stored.
 *
 * SCOPES: uses the already-granted `Files.ReadWrite` scope (includes read). No new scope.
 */

const PROVIDER_KEY = "microsoft-excel";
const WORKBOOK_FILTER = ["excel_workbook"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "workbooks_count",
    label: "Workbooks",
    description: "Your Excel workbooks in OneDrive.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "workbooks_modified_over_time",
    label: "Workbooks modified over time",
    description: "Workbooks modified per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "workbooks_created_over_time",
    label: "Workbooks created over time",
    description: "Workbooks created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "worksheets_count",
    label: "Worksheets",
    description: "Worksheets in the selected workbook.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: WORKBOOK_FILTER,
  },
  {
    key: "tables_count",
    label: "Tables",
    description: "Tables in the selected workbook.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: WORKBOOK_FILTER,
  },
];

const WORKBOOK_SCOPED_METRICS: ReadonlySet<string> = new Set(["worksheets_count", "tables_count"]);
const WORKBOOK_SCAN_METRICS: ReadonlySet<string> = new Set([
  "workbooks_count",
  "workbooks_modified_over_time",
  "workbooks_created_over_time",
]);

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from an Excel read into a typed, leak-free AnalyticsSourceError. */
function classifyExcelError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Microsoft Excel before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof ExcelRateLimitError) {
    return new AnalyticsSourceError("Microsoft Excel's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError("ChainReact can't read that Excel workbook. Re-pick a workbook.", "INVALID_QUERY");
  }
  // No raw Graph error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Microsoft Excel data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Excel connection (or MISSING_CREDENTIAL). */
async function resolveOwnExcel(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Microsoft Excel to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of your workbooks — you have more than a single widget scans."]
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
  facts: readonly WorkbookFact[],
  pick: (f: WorkbookFact) => number | null,
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

export const microsoftExcelAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Microsoft Excel",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Microsoft Excel metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the required workbook id server-side BEFORE any I/O (workbook-scoped only).
    let workbookId: string | null = null;
    if (WORKBOOK_SCOPED_METRICS.has(query.metricKey)) {
      try {
        workbookId = parseWorkbookId(query.filters?.excel_workbook);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick an Excel workbook.",
          "INVALID_QUERY",
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnExcel(ctx);

    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Account-wide workbook metrics (shared whole-drive scan) ───────────
      if (WORKBOOK_SCAN_METRICS.has(query.metricKey)) {
        const scan = await run((t) => scanWorkbooks(t));
        if (query.metricKey === "workbooks_count") {
          return scalarResult(
            "workbooks_count",
            scan.facts.length,
            generatedAt,
            truncationWarning(scan.truncated),
            scan.truncated,
          );
        }
        const pick =
          query.metricKey === "workbooks_created_over_time"
            ? (f: WorkbookFact) => f.createdMs
            : (f: WorkbookFact) => f.modifiedMs;
        return bucketSeries(scan.facts, pick, query.range, generatedAt, scan.truncated);
      }

      // ── Workbook-scoped counts (metadata lists — only the length is used) ──
      if (query.metricKey === "worksheets_count") {
        const sheets = await run((t) => worksheetsList({ accessToken: t, workbookId: workbookId! }));
        return scalarResult("worksheets_count", sheets.length, generatedAt, [], false);
      }
      // tables_count
      const tables = await run((t) => tablesList({ accessToken: t, workbookId: workbookId! }));
      return scalarResult("tables_count", tables.length, generatedAt, [], false);
    } catch (err) {
      throw classifyExcelError(err);
    }
  },
};
