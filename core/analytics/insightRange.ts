/**
 * CANONICAL date-range semantics for Custom Insights
 * (Slice ANALYTICS-CONNECTED-DATA-CD-5A).
 *
 * ONE definition shared by the builder UI, the saved-widget query translator
 * and the server's range resolver, so a preset can never mean one thing in the
 * chart and another in the query. Pure — no I/O, no `Date.now()` (callers
 * inject `now`), no repository/service imports.
 *
 * ── The two boundary conventions, and why they differ ────────────────────────
 * The QUERY ENGINE works in UTC half-open windows: `[from, to)` — inclusive
 * start, EXCLUSIVE end. That is what makes contiguous buckets tile without
 * double-counting, and it is unchanged by this slice.
 *
 * A PERSON picking "To: July 31" means July 31 is INCLUDED. Before CD-5A the
 * builder wrote that date straight onto the wire, where `Date.parse` read it as
 * midnight-at-the-start-of-July-31 — silently excluding the whole day the user
 * had just asked for. {@link customRangeToWireRange} is the translator: it
 * keeps the user's inclusive calendar date in the saved config and converts it
 * to the next exclusive UTC instant on the wire. Nobody has to understand
 * `[from, to)` notation to get the range they asked for.
 */

const DAY_MS = 86_400_000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Range presets the connected query engine can represent exactly.
 *
 * A superset of the legacy dashboard's five ids, so every previously saved
 * Insight config keeps parsing and keeps meaning the same thing.
 */
export type InsightRangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "ytd"
  | "12m";

export interface InsightRangePresetInfo {
  id: InsightRangePreset;
  label: string;
  /**
   * Longest window this preset can resolve to, in days. Used to hide a preset
   * a dataset's `maxRangeDays` could not accept — the UI never offers a range
   * the server would reject.
   */
  maxSpanDays: number;
}

/** Display order in the builder. */
export const INSIGHT_RANGE_PRESETS: readonly InsightRangePresetInfo[] = [
  { id: "today", label: "Today", maxSpanDays: 1 },
  { id: "yesterday", label: "Yesterday", maxSpanDays: 1 },
  { id: "7d", label: "Last 7 days", maxSpanDays: 7 },
  { id: "30d", label: "Last 30 days", maxSpanDays: 30 },
  { id: "90d", label: "Last 90 days", maxSpanDays: 90 },
  { id: "this_month", label: "This month", maxSpanDays: 31 },
  { id: "last_month", label: "Last month", maxSpanDays: 31 },
  { id: "ytd", label: "Year to date", maxSpanDays: 366 },
  { id: "12m", label: "Last 12 months", maxSpanDays: 365 },
];

export function presetLabel(preset: InsightRangePreset): string {
  return INSIGHT_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? preset;
}

/** Presets a dataset whose ceiling is `maxRangeDays` can actually accept. */
export function presetsWithinLimit(maxRangeDays: number): readonly InsightRangePresetInfo[] {
  return INSIGHT_RANGE_PRESETS.filter((p) => p.maxSpanDays <= maxRangeDays);
}

// ── UTC calendar helpers ─────────────────────────────────────────────────────

export function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function addUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

function startOfUtcYear(ms: number): number {
  return Date.UTC(new Date(ms).getUTCFullYear(), 0, 1);
}

/**
 * The `[from, to)` window a preset resolves to, in epoch ms.
 *
 * `today` / `7d` / `30d` / `90d` / `ytd` keep their exact pre-CD-5A meaning —
 * rolling windows ending at `now` — so saved widgets do not shift.
 */
export function resolvePresetWindow(
  preset: InsightRangePreset,
  now: number,
): { fromMs: number; toMs: number } {
  switch (preset) {
    case "today":
      return { fromMs: startOfUtcDay(now), toMs: now };
    case "yesterday": {
      const todayStart = startOfUtcDay(now);
      return { fromMs: todayStart - DAY_MS, toMs: todayStart };
    }
    case "7d":
      return { fromMs: now - 7 * DAY_MS, toMs: now };
    case "30d":
      return { fromMs: now - 30 * DAY_MS, toMs: now };
    case "90d":
      return { fromMs: now - 90 * DAY_MS, toMs: now };
    case "this_month":
      return { fromMs: startOfUtcMonth(now), toMs: now };
    case "last_month": {
      const thisMonth = startOfUtcMonth(now);
      return { fromMs: addUtcMonths(thisMonth, -1), toMs: thisMonth };
    }
    case "ytd":
      return { fromMs: startOfUtcYear(now), toMs: now };
    case "12m":
      // Rolling 365 days — always inside the 366-day contract ceiling, and
      // unambiguous across leap years (a calendar "12 months" can be 366).
      return { fromMs: now - 365 * DAY_MS, toMs: now };
  }
}

// ── Custom ranges: inclusive end date ⇄ exclusive wire boundary ──────────────

/**
 * Exclusive epoch-ms boundary for a user-picked INCLUSIVE end date.
 *
 * `"2026-07-31"` → the instant that starts 2026-08-01, so the whole of July 31
 * counts. A value that is already a full instant is passed through unchanged
 * (it was authored as an exclusive boundary, not picked from a date field).
 * Returns null when unparseable.
 */
export function inclusiveEndToExclusiveMs(value: string): number | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return DATE_ONLY_RE.test(value) ? parsed + DAY_MS : parsed;
}

/** Inclusive-start epoch ms for a picked start date. Returns null if unparseable. */
export function startDateToMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The `[from, to)` window a saved custom range means, honouring the inclusive
 * end date. Returns null when either endpoint is unparseable.
 */
export function customRangeWindow(
  from: string,
  to: string,
): { fromMs: number; toMs: number } | null {
  const fromMs = startDateToMs(from);
  const toMs = inclusiveEndToExclusiveMs(to);
  if (fromMs === null || toMs === null) return null;
  return { fromMs, toMs };
}

/**
 * Convert a stored custom range (inclusive end date) into the wire range the
 * query engine consumes (exclusive end instant). This is the ONLY place the
 * translation happens.
 */
export function customRangeToWireRange(
  from: string,
  to: string,
): { from: string; to: string } {
  const window = customRangeWindow(from, to);
  if (!window) return { from, to }; // let the server reject it with its own copy
  return { from, to: new Date(window.toMs).toISOString() };
}

/**
 * Plain-language reason a custom range cannot be queried yet, or null when it
 * is fine. Phrased for a non-technical user and mirrored by the server.
 */
export function validateCustomRange(
  from: string,
  to: string,
  maxRangeDays: number,
): string | null {
  if (!from || !to) return "Enter both a start and an end date.";
  const fromMs = startDateToMs(from);
  const toExclusiveMs = inclusiveEndToExclusiveMs(to);
  if (fromMs === null || toExclusiveMs === null) return "Enter both a start and an end date.";
  // Inclusive end: start === end is a valid single day.
  if (toExclusiveMs <= fromMs) return "The start date must be on or before the end date.";
  if (toExclusiveMs - fromMs > maxRangeDays * DAY_MS) {
    return `This data can cover at most ${maxRangeDays} days at a time.`;
  }
  return null;
}

// ── Time grain ───────────────────────────────────────────────────────────────

export type InsightGrain = "auto" | "day" | "week" | "month";
export type ResolvedInsightGrain = "day" | "week" | "month";

/** Smallest window (in days) for which each grain produces a meaningful chart. */
const GRAIN_MIN_SPAN_DAYS: Record<ResolvedInsightGrain, number> = {
  day: 1,
  week: 7,
  month: 28,
};

/** Days per bucket, used to keep an explicit grain inside the bucket ceiling. */
const GRAIN_APPROX_DAYS: Record<ResolvedInsightGrain, number> = {
  day: 1,
  week: 7,
  month: 28,
};

export const INSIGHT_MAX_BUCKETS = 400;

/**
 * Is an explicit grain meaningful for a window of `spanDays`?
 *
 * Two ways a grain stops making sense:
 *  - It is COARSER than the range — "Monthly" over a single day collapses the
 *    whole chart into one bucket that pretends to describe a month.
 *  - It would produce more buckets than the contract's ceiling.
 *
 * "auto" is always allowed; the server picks a readable grain from the span.
 */
export function isGrainAvailable(grain: InsightGrain, spanDays: number): boolean {
  if (grain === "auto") return true;
  if (spanDays < GRAIN_MIN_SPAN_DAYS[grain]) return false;
  return Math.ceil(spanDays / GRAIN_APPROX_DAYS[grain]) <= INSIGHT_MAX_BUCKETS;
}

/** Grains offerable for a window, always including "auto". */
export function availableGrains(spanDays: number): readonly InsightGrain[] {
  return (["auto", "day", "week", "month"] as const).filter((g) =>
    isGrainAvailable(g, spanDays),
  );
}

/**
 * Days a stored range covers, for grain decisions. Presets need `now`; a custom
 * range is measured from its own endpoints. Returns null when unparseable.
 */
export function rangeSpanDays(
  range: { preset: InsightRangePreset } | { from: string; to: string },
  now: number,
): number | null {
  const window =
    "preset" in range
      ? resolvePresetWindow(range.preset, now)
      : customRangeWindow(range.from, range.to);
  if (!window) return null;
  return Math.max(1, Math.ceil((window.toMs - window.fromMs) / DAY_MS));
}

// ── Previous period ──────────────────────────────────────────────────────────

/**
 * The canonical previous period: immediately before the current window, the
 * same duration, never overlapping, same UTC boundaries.
 *
 * July 1–31 (i.e. `[Jul 1, Aug 1)`) compares with `[Jun 1, Jul 1)`; a 7-day
 * window compares with the 7 days before it. This mirrors exactly what every
 * provider adapter already scans for `compare: "previous_period"`.
 */
export function previousPeriodWindow(
  fromMs: number,
  toMs: number,
): { fromMs: number; toMs: number } {
  const span = toMs - fromMs;
  return { fromMs: fromMs - span, toMs: fromMs };
}

// ── Human-readable descriptions ──────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jul 1, 2026" for an epoch-ms instant, in UTC. */
export function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Describe a `[from, to)` window the way a person reads a date range — with an
 * INCLUSIVE last day. `[Jul 1, Aug 1)` reads "Jul 1 – Jul 31, 2026".
 *
 * A window ending mid-day (every rolling preset ends at `now`) names the day it
 * ends on, because that day is genuinely included.
 */
export function describeWindow(fromMs: number, toMs: number): string {
  const lastIncluded = startOfUtcDay(toMs) === toMs ? toMs - DAY_MS : toMs;
  const start = formatUtcDate(fromMs);
  const end = formatUtcDate(lastIncluded);
  return start === end ? start : `${start} – ${end}`;
}
