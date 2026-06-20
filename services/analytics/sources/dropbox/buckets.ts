/**
 * Pure time-bucketing + folder-path validation helpers for the Dropbox analytics
 * source (Slice ANALYTICS-SOURCES-DROPBOX-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget
 * config never supplies a raw Dropbox query. Only COUNTS + a file's modified
 * timestamp + extension are derived — never a file name, path, id, size, content,
 * preview, sharing link, or owner.
 *
 * Dropbox exposes no "created" timestamp on file metadata — only `server_modified`
 * (and `client_modified`). The over-time series buckets by `server_modified` (the
 * authoritative server-side timestamp) per the slice's "prefer modified" guidance.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface DropboxTimeBucket {
  /** Stable key + axis label (bucket start date, YYYY-MM-DD UTC). */
  key: string;
  /** Inclusive start (epoch ms, UTC day start). */
  startMs: number;
  /** Exclusive end (epoch ms). */
  endMs: number;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDate(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/** Split [since, until) into ≤ MAX_BUCKETS day-aligned buckets ([] for invalid). */
export function planBuckets(
  sinceIso: string,
  untilIso: string,
  maxBuckets = MAX_BUCKETS,
): DropboxTimeBucket[] {
  const since = Date.parse(sinceIso);
  const until = Date.parse(untilIso);
  if (Number.isNaN(since) || Number.isNaN(until) || until <= since) return [];

  const startDay = startOfUtcDay(since);
  const endDay = startOfUtcDay(until);
  const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1;

  let bucketDays: number;
  if (spanDays <= 14) bucketDays = 1;
  else if (spanDays <= 84) bucketDays = 7;
  else bucketDays = 30;
  if (Math.ceil(spanDays / bucketDays) > maxBuckets) {
    bucketDays = Math.ceil(spanDays / maxBuckets);
  }

  const buckets: DropboxTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly DropboxTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate the optional `dropbox_folder` filter into a safe Dropbox folder path.
 * Empty / absent → `""` (the Dropbox root convention). The value comes from the
 * `dropbox:folders` picker (path-as-value, with a Root option `""`). Dropbox paths
 * start with `/`, or are `id:`/`ns:` references; this is the defense-in-depth check
 * before the path is passed as a JSON arg to `list_folder`. Throws on a bad value
 * (the adapter maps the throw to INVALID_QUERY).
 */
export function parseFolderPath(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("Pick a Dropbox folder for this widget.");
  const v = value.trim();
  if (v === "") return "";
  if (v.length > 1024 || /[\r\n]/.test(v)) {
    throw new Error("Pick a Dropbox folder for this widget.");
  }
  if (!(v.startsWith("/") || v.startsWith("id:") || v.startsWith("ns:"))) {
    throw new Error("Pick a Dropbox folder for this widget.");
  }
  return v;
}
