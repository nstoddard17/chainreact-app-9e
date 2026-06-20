import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError, RateLimitError } from "@/integrations/_shared/dropbox/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { MAX_PAGES, PAGE_SIZE, scanFolder, type FileFact } from "./api";
import { bucketIndexForMs, parseFolderPath, planBuckets, type DropboxTimeBucket } from "./buckets";

/**
 * Dropbox connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-DROPBOX-1).
 *
 * READ-ONLY + METADATA-ONLY. Reduces a bounded recursive `list_folder` scan of a
 * folder (or root) to numeric file aggregates (file/folder counts, files-modified
 * over time, files-by-type). Never executes a workflow node, never takes a raw Dropbox
 * query from widget config (the folder is a validated path from the picker; recursion
 * + limit are server-side constants), and never reads a file name, path, id, size,
 * content, preview, sharing link, or owner. Approved metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Dropbox is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins refresh/retry to that row's
 * `providerAccountId` — never a co-member's. The cache layer keys personal providers
 * with `source_user_id = ctx.userId`, so each member's snapshot is distinct. No Dropbox
 * connection → typed MISSING_CREDENTIAL. Dropbox is REFRESHABLE → reads run through
 * `refreshAndRetry`.
 *
 * PRIVACY: only COUNTS + a file's modified-timestamp bucket + extension are computed
 * and cached. No file names, paths, ids, sizes, content, previews, sharing links,
 * owners, or raw Dropbox payloads are returned or stored. (A file's extension — a type
 * category like "pdf" — is the only text surfaced, on files_by_type. Folder picker
 * labels live in widget config, not in chart data.)
 *
 * SCOPES: uses the already-granted `files.metadata.read` scope. No new scope.
 */

const PROVIDER_KEY = "dropbox";
const FOLDER_FILTER = ["dropbox_folder"] as const;
/** Cap distinct file-type bars so a long-tail of extensions can't bloat the result. */
const MAX_TYPE_BARS = 12;
const NO_TYPE_LABEL = "(no type)";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "files_count",
    label: "Files",
    description: "Files in the selected folder (or all of Dropbox).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
  {
    key: "folders_count",
    label: "Folders",
    description: "Subfolders in the selected folder (or all of Dropbox).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
  {
    key: "files_modified_over_time",
    label: "Files modified over time",
    description: "Files modified per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
  {
    key: "files_by_type",
    label: "Files by type",
    description: "Files grouped by extension.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Dropbox read into a typed, leak-free AnalyticsSourceError. */
function classifyDropboxError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Dropbox before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof RateLimitError) {
    return new AnalyticsSourceError("Dropbox's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Dropbox folder. Re-pick a folder.",
      "INVALID_QUERY",
    );
  }
  // No raw Dropbox error body / token / path / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Dropbox data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Dropbox connection (or MISSING_CREDENTIAL). */
async function resolveOwnDropbox(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Dropbox to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? [`Based on the first ${MAX_PAGES * PAGE_SIZE} items — this folder has more than that.`]
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
  rows: ReadonlyArray<{ date: string; count: number }>,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: [dimension],
    measures: ["count"],
    rows: rows.map((r) => ({ date: r.date, count: r.count })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

/** Top file-type bars by count (extension labels only), capped to MAX_TYPE_BARS. */
function filesByType(files: readonly FileFact[]): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    const label = f.ext.length > 0 ? f.ext : NO_TYPE_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TYPE_BARS);
}

export const dropboxAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Dropbox",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Dropbox metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the optional folder filter server-side BEFORE any I/O ("" = root).
    let folderPath: string;
    try {
      folderPath = parseFolderPath(query.filters?.dropbox_folder);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Dropbox folder.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnDropbox(ctx);

    let scan;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId,
        apiCall: (accessToken: string) => scanFolder(accessToken, folderPath),
      });
    } catch (err) {
      throw classifyDropboxError(err);
    }

    const facts: readonly FileFact[] = scan.facts;
    const files = facts.filter((f) => f.isFile);
    const truncated = scan.truncated;

    // ── Count scalars ─────────────────────────────────────────────────────────
    if (query.metricKey === "files_count") {
      return scalarResult("files_count", files.length, generatedAt, truncationWarning(truncated), truncated);
    }
    if (query.metricKey === "folders_count") {
      const folders = facts.length - files.length;
      return scalarResult("folders_count", folders, generatedAt, truncationWarning(truncated), truncated);
    }

    // ── Bar: files by extension (type labels only) ────────────────────────────
    if (query.metricKey === "files_by_type") {
      return seriesResult("type", filesByType(files), generatedAt, truncationWarning(truncated), truncated);
    }

    // ── Series: files modified over time (by server_modified) ─────────────────
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return seriesResult("date", [], generatedAt, ["The selected date range is empty or invalid."], truncated);
    }
    const counts = new Array<number>(buckets.length).fill(0);
    for (const f of files) {
      const idx = bucketIndexForMs(buckets, f.modifiedMs);
      if (idx >= 0) counts[idx]! += 1;
    }
    const rows = buckets.map((b: DropboxTimeBucket, i) => ({ date: b.key, count: counts[i] ?? 0 }));
    return seriesResult("date", rows, generatedAt, truncationWarning(truncated), truncated);
  },
};
