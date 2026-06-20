/**
 * Pure day-bucketing + workbook-id validation helpers for the Microsoft Excel analytics
 * source (Slice ANALYTICS-SOURCES-EXCEL-1). No I/O — unit tested directly.
 *
 * The date window + bucket plan are built HERE from the dashboard range; widget config
 * never supplies a raw Graph query. Only COUNTS + workbook created/modified timestamps
 * are derived — never a worksheet cell value, formula, range, table row, or file name.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface ExcelTimeBucket {
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
): ExcelTimeBucket[] {
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

  const buckets: ExcelTimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    buckets.push({ key: utcDate(s), startMs: s, endMs: s + bucketDays * DAY_MS });
  }
  return buckets;
}

/** Index of the bucket containing `ms` (start inclusive, end exclusive), or -1. */
export function bucketIndexForMs(buckets: readonly ExcelTimeBucket[], ms: number | null): number {
  if (ms === null) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (ms >= buckets[i]!.startMs && ms < buckets[i]!.endMs) return i;
  }
  return -1;
}

/**
 * Validate the REQUIRED `excel_workbook` filter into a safe Graph DriveItem id (from the
 * `microsoft-excel:workbooks` picker, id-as-value). Drive item ids are opaque tokens;
 * this is the defense-in-depth check before the id is URL-encoded into a Graph path.
 * Throws on a bad value (the adapter maps the throw to INVALID_QUERY). There is no "all
 * workbooks" fallback — worksheet/table metrics are always scoped to one validated id.
 */
export function parseWorkbookId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Pick an Excel workbook for this widget.");
  const v = value.trim();
  if (v.length === 0 || v.length > 512 || !/^[A-Za-z0-9!._%\-=+~]+$/.test(v)) {
    throw new Error("Pick an Excel workbook for this widget.");
  }
  return v;
}
