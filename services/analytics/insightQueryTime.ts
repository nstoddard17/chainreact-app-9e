import type {
  AnalyticsBucket,
  AnalyticsResolvedGrain,
} from "@/contracts/analyticsQuery";
import { ANALYTICS_QUERY_MAX_BUCKETS } from "@/contracts/analyticsQuery";
import type { NormalizedAnalyticsQuery } from "@/contracts/analyticsQueryCapabilities";

/**
 * PURE time semantics for the flexible analytics query path
 * (Slice ANALYTICS-FLEXIBILITY-CS-1). Split from `insightQuery.ts` for
 * file-size hygiene — no I/O, no Date.now(); the service injects `now`.
 *
 * Semantics (documented in the CS-1 outcome doc):
 *   - All bucketing is UTC; buckets are CALENDAR truncations — day, ISO-Monday
 *     week (matching Postgres `date_trunc('week')`), month-start.
 *   - The query window is [from, to) — inclusive start, EXCLUSIVE end.
 *   - Presets mirror the legacy overview's rolling windows (today = UTC
 *     midnight → now; Nd = now − N×24h → now; ytd = Jan-1 UTC → now).
 */

const DAY_MS = 86_400_000;

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcYear(ms: number): number {
  return Date.UTC(new Date(ms).getUTCFullYear(), 0, 1);
}

/** Resolve a request range to the [from, to) window in epoch ms. */
export function resolveQueryRange(
  range: NormalizedAnalyticsQuery["range"],
  now: number,
): { fromMs: number; toMs: number } {
  if ("from" in range) {
    return { fromMs: Date.parse(range.from), toMs: Date.parse(range.to) };
  }
  switch (range.preset) {
    case "today":
      return { fromMs: startOfUtcDay(now), toMs: now };
    case "7d":
      return { fromMs: now - 7 * DAY_MS, toMs: now };
    case "30d":
      return { fromMs: now - 30 * DAY_MS, toMs: now };
    case "90d":
      return { fromMs: now - 90 * DAY_MS, toMs: now };
    case "ytd":
      return { fromMs: startOfUtcYear(now), toMs: now };
  }
}

/** Auto-grain rule: ≤ 92 days → day; ≤ 731 days → week; beyond → month. */
export function resolveTimeGrain(
  grain: "auto" | "day" | "week" | "month",
  spanMs: number,
): AnalyticsResolvedGrain {
  if (grain !== "auto") return grain;
  const spanDays = Math.ceil(spanMs / DAY_MS);
  if (spanDays <= 92) return "day";
  if (spanDays <= 731) return "week";
  return "month";
}

function truncToGrain(ms: number, grain: AnalyticsResolvedGrain): number {
  const day = startOfUtcDay(ms);
  if (grain === "day") return day;
  if (grain === "week") {
    // ISO week — Monday start (matches Postgres date_trunc('week')).
    const dow = (new Date(day).getUTCDay() + 6) % 7;
    return day - dow * DAY_MS;
  }
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function nextBucketStart(ms: number, grain: AnalyticsResolvedGrain): number {
  if (grain === "day") return ms + DAY_MS;
  if (grain === "week") return ms + 7 * DAY_MS;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * Contiguous calendar bucket starts covering [fromMs, toMs). The first bucket
 * is the truncation CONTAINING `from` (possibly partial); the range itself
 * clamps which runs count.
 */
export function bucketStartsFor(
  grain: AnalyticsResolvedGrain,
  fromMs: number,
  toMs: number,
): number[] {
  const starts: number[] = [];
  for (let t = truncToGrain(fromMs, grain); t < toMs; t = nextBucketStart(t, grain)) {
    starts.push(t);
    if (starts.length > ANALYTICS_QUERY_MAX_BUCKETS) break;
  }
  return starts;
}

export function toBuckets(
  starts: readonly number[],
  grain: AnalyticsResolvedGrain,
): AnalyticsBucket[] {
  return starts.map((s) => ({
    start: new Date(s).toISOString(),
    end: new Date(nextBucketStart(s, grain)).toISOString(),
    label: new Date(s).toISOString().slice(0, 10),
  }));
}
