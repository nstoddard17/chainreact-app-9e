/**
 * Pure time-bucketing + query helpers for the GitHub analytics source
 * (Slice ANALYTICS-SOURCES-GITHUB-1). No I/O — unit tested directly.
 *
 * GitHub's Search API returns an exact `total_count` per query without
 * pagination, so a time series is built as ONE search per bucket. To keep call
 * volume bounded (GitHub search is 30 req/min), the number of buckets is hard-
 * capped: granularity widens (day → week → month → coarser) until the count fits
 * within {@link MAX_BUCKETS}.
 */

export const MAX_BUCKETS = 12;
const DAY_MS = 86_400_000;

export interface TimeBucket {
  /** Stable key + axis label (the bucket's start date, YYYY-MM-DD UTC). */
  key: string;
  /** Inclusive start date, YYYY-MM-DD (UTC). */
  sinceDate: string;
  /** Inclusive end date, YYYY-MM-DD (UTC). */
  untilDate: string;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function utcDate(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

/**
 * Split [since, until] into ≤ MAX_BUCKETS contiguous, inclusive day-ranges.
 * Returns [] for an invalid/empty window (caller surfaces a warning).
 */
export function planBuckets(
  sinceIso: string,
  untilIso: string,
  maxBuckets = MAX_BUCKETS,
): TimeBucket[] {
  const since = Date.parse(sinceIso);
  const until = Date.parse(untilIso);
  if (Number.isNaN(since) || Number.isNaN(until) || until <= since) return [];

  const startDay = startOfUtcDay(since);
  const endDay = startOfUtcDay(until);
  const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1;

  // Pick a "nice" granularity, then guarantee the cap by widening if needed.
  let bucketDays: number;
  if (spanDays <= 14) bucketDays = 1;
  else if (spanDays <= 84) bucketDays = 7;
  else bucketDays = 30;
  if (Math.ceil(spanDays / bucketDays) > maxBuckets) {
    bucketDays = Math.ceil(spanDays / maxBuckets);
  }

  const buckets: TimeBucket[] = [];
  for (let s = startDay; s <= endDay; s += bucketDays * DAY_MS) {
    const e = Math.min(s + (bucketDays - 1) * DAY_MS, endDay);
    buckets.push({ key: utcDate(s), sinceDate: utcDate(s), untilDate: utcDate(e) });
  }
  return buckets;
}

/** `owner/name` parsed + validated. Throws on a malformed value. */
export interface RepoRef {
  owner: string;
  name: string;
  full: string;
}

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/**
 * Validate the `repo` filter to a safe `owner/name`. Server-side allow-listing of
 * the shape (no spaces, no qualifiers, no injection into the search query). Throws
 * a plain Error the adapter maps to an INVALID_QUERY AnalyticsSourceError.
 */
export function parseRepoRef(value: unknown): RepoRef {
  if (typeof value !== "string" || !REPO_RE.test(value)) {
    throw new Error("A valid repository (owner/name) filter is required.");
  }
  const [owner, name] = value.split("/");
  return { owner: owner!, name: name!, full: value };
}

export type GithubSeriesMetric = "issues_opened" | "prs_opened" | "prs_merged";

/** Build the GitHub search `q` for a series-metric bucket. */
export function seriesSearchQuery(
  metric: GithubSeriesMetric,
  repo: RepoRef,
  bucket: TimeBucket,
): string {
  const range = `${bucket.sinceDate}..${bucket.untilDate}`;
  switch (metric) {
    case "issues_opened":
      return `repo:${repo.full} is:issue created:${range}`;
    case "prs_opened":
      return `repo:${repo.full} is:pr created:${range}`;
    case "prs_merged":
      return `repo:${repo.full} is:pr is:merged merged:${range}`;
  }
}

/** Build the GitHub search `q` for an open-count scalar metric. */
export function openCountSearchQuery(
  kind: "open_issues" | "open_prs",
  repo: RepoRef,
): string {
  return kind === "open_issues"
    ? `repo:${repo.full} is:issue is:open`
    : `repo:${repo.full} is:pr is:open`;
}
