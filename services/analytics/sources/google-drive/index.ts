import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { GoogleDriveRateLimitError, scanDrive, type FileFact } from "./api";
import { bucketIndexForMs, parseFolderId, planBuckets } from "./buckets";

/**
 * Google Drive connected-app analytics source — v1
 * (Slice ANALYTICS-SOURCES-GDRIVE-1). Completes the file-storage trio after Dropbox
 * and OneDrive, porting the same file-analytics pattern onto Drive v3 `files.list`.
 *
 * READ-ONLY + METADATA-ONLY. Reduces a bounded recursive `files.list` traversal of a
 * My Drive folder (or drive root) to numeric file aggregates (file/folder counts,
 * files-modified over time, files-by-type). Never executes a workflow node, never
 * takes a raw Drive `q` from widget config (the folder is a validated Drive file id;
 * `fields`/`pageSize`/`trashed=false` are server-side constants), and never reads a
 * file name, path, webViewLink, owner, content, preview, or sharing link. Approved
 * metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Google Drive is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins refresh/retry to that row — never a
 * co-member's. The cache layer keys personal providers with `source_user_id =
 * ctx.userId`, so each member's snapshot is distinct. No connection →
 * MISSING_CREDENTIAL. Google Drive is REFRESHABLE → reads run through `refreshAndRetry`.
 *
 * PRIVACY: only COUNTS + a file's modified-bucket + type label are computed and
 * cached. No file names, paths, ids, sizes, webViewLinks, owners, permissions,
 * content, previews, sharing links, or raw Drive payloads are returned or stored.
 * (The type label — a category like "pdf" or "gdoc" — is the only text surfaced, on
 * files_by_type. Folder picker labels live in widget config, not chart data.)
 *
 * SCOPES: uses the already-granted `drive` scope (includes read). No new scope.
 */

const PROVIDER_KEY = "google-drive";
const FOLDER_FILTER = ["gdrive_folder"] as const;
const MAX_TYPE_BARS = 12;
const NO_TYPE_LABEL = "(no type)";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "files_count",
    label: "Files",
    description: "Files in the selected folder (or all of Google Drive).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
  {
    key: "folders_count",
    label: "Folders",
    description: "Subfolders in the selected folder (or all of Google Drive).",
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
    description: "Files grouped by type.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: FOLDER_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Google Drive read into a typed, leak-free AnalyticsSourceError. */
function classifyGoogleDriveError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Google Drive before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof GoogleDriveRateLimitError) {
    return new AnalyticsSourceError("Google Drive's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Google Drive folder. Re-pick a folder.",
      "INVALID_QUERY",
    );
  }
  // No raw Drive error body / token / path / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Google Drive data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Google Drive connection (or MISSING_CREDENTIAL). */
async function resolveOwnDrive(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Google Drive to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of this drive — it has more folders/files than a single widget scans."]
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

/** Top file-type bars by count (type labels only), capped to MAX_TYPE_BARS. */
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

export const googleDriveAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Google Drive",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Google Drive metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the optional folder filter server-side BEFORE any I/O ("" = root).
    let folderId: string;
    try {
      folderId = parseFolderId(query.filters?.gdrive_folder);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Google Drive folder.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnDrive(ctx);

    let scan;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId,
        apiCall: (accessToken: string) => scanDrive(accessToken, folderId),
      });
    } catch (err) {
      throw classifyGoogleDriveError(err);
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

    // ── Bar: files by type (type labels only) ─────────────────────────────────
    if (query.metricKey === "files_by_type") {
      return seriesResult("type", filesByType(files), generatedAt, truncationWarning(truncated), truncated);
    }

    // ── Series: files modified over time (by modifiedTime) ────────────────────
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return seriesResult("date", [], generatedAt, ["The selected date range is empty or invalid."], truncated);
    }
    const counts = new Array<number>(buckets.length).fill(0);
    for (const f of files) {
      const idx = bucketIndexForMs(buckets, f.modifiedMs);
      if (idx >= 0) counts[idx]! += 1;
    }
    const rows = buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 }));
    return seriesResult("date", rows, generatedAt, truncationWarning(truncated), truncated);
  },
};
