import type {
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsTotals,
  AnalyticsTimePoint,
  AnalyticsWorkflowStat,
  AnalyticsAppStat,
  AnalyticsHeatmap,
  AnalyticsRecentRun,
} from "@/contracts/analytics";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import type { AnalyticsRunRow } from "@/repositories/workflowRuns";
import * as workflowsRepo from "@/repositories/workflows";
import * as integrationsRepo from "@/repositories/integrations";
import { getProvider } from "@/integrations/_registry";

/**
 * Account-scoped analytics aggregation (Slice ANALYTICS-1).
 *
 * Computes the real `AnalyticsOverview` from the account's own runs, workflows,
 * and connected integrations. The heavy lifting is a PURE function
 * (`buildAnalyticsOverview`) so the bucketing / trend / heatmap math is unit
 * tested without a DB. `getAnalyticsOverview` is the thin fetch-then-build glue.
 *
 * HONESTY NOTES (what is real vs. not yet backed):
 *   - Headline totals, success rate, runs-over-time, outcomes, top workflows,
 *     activity heatmap, and recent runs are REAL, derived from `workflow_runs`.
 *   - TEST runs are excluded from every aggregate (production-activity view).
 *   - `apps` is CONNECTION-LEVEL (connected accounts per provider) — NOT per-run
 *     app attribution, which the run record doesn't carry. The widget is labeled
 *     "Connected apps" accordingly. Run-level attribution is a documented
 *     follow-up.
 *   - Time bucketing is UTC. Per-account/user timezone resolution is a follow-up.
 *   - All aggregation is in-memory over a capped run window; `truncated` flags
 *     when the cap was hit.
 */

const HEATMAP_WEEKS = 16;
const DAY_MS = 86_400_000;
const MAX_TIME_POINTS = 92;

export interface RawAnalyticsWorkflow {
  id: string;
  name: string;
  /** Lifecycle state; "active" counts toward activeWorkflows. */
  state: string;
}

export interface RawAnalyticsApp {
  provider: string;
  label: string;
}

export interface BuildOverviewInput {
  range: AnalyticsRange;
  /** Evaluation "now" (epoch ms) — injected for deterministic tests. */
  now: number;
  /** Terminal runs newest-first; may include test runs (filtered here). */
  runs: readonly AnalyticsRunRow[];
  workflows: readonly RawAnalyticsWorkflow[];
  apps: readonly RawAnalyticsApp[];
  /** True when the run read hit its row cap. */
  truncated: boolean;
}

interface RangeWindow {
  since: number;
  until: number;
  prevSince: number;
}

/**
 * Resolve [since, until) plus the preceding equal-length window start for trend
 * computation. `until` is `now`; `since` is the range's lookback floor.
 */
export function computeRangeWindow(range: AnalyticsRange, now: number): RangeWindow {
  const until = now;
  let since: number;
  switch (range) {
    case "today":
      since = startOfUtcDay(now);
      break;
    case "7d":
      since = now - 7 * DAY_MS;
      break;
    case "30d":
      since = now - 30 * DAY_MS;
      break;
    case "90d":
      since = now - 90 * DAY_MS;
      break;
    case "ytd":
      since = startOfUtcYear(now);
      break;
  }
  const len = until - since;
  return { since, until, prevSince: since - len };
}

/** The earliest timestamp the run reader must cover (range prev-window OR heatmap). */
export function analyticsFetchSince(range: AnalyticsRange, now: number): number {
  const { prevSince } = computeRangeWindow(range, now);
  const heatmapStart = startOfUtcDay(now) - (HEATMAP_WEEKS * 7 - 1) * DAY_MS;
  return Math.min(prevSince, heatmapStart);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcYear(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), 0, 1);
}

function utcDateKey(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

function durationMs(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const s = Date.parse(startedAt);
  const f = Date.parse(finishedAt);
  if (Number.isNaN(s) || Number.isNaN(f)) return null;
  return f >= s ? f - s : 0;
}

function totalsFor(runs: readonly AnalyticsRunRow[], activeWorkflows: number, totalWorkflows: number, connectedApps: number): AnalyticsTotals {
  let succeeded = 0;
  let durSum = 0;
  let durCount = 0;
  for (const r of runs) {
    if (r.status === "succeeded") succeeded += 1;
    const d = durationMs(r.startedAt, r.finishedAt);
    if (d !== null) {
      durSum += d;
      durCount += 1;
    }
  }
  const total = runs.length;
  return {
    runs: total,
    succeeded,
    failed: total - succeeded,
    successRate: total > 0 ? succeeded / total : 0,
    avgDurationMs: durCount > 0 ? Math.round(durSum / durCount) : null,
    activeWorkflows,
    totalWorkflows,
    connectedApps,
  };
}

function buildRunsOverTime(
  runs: readonly AnalyticsRunRow[],
  since: number,
  until: number,
): AnalyticsTimePoint[] {
  const spanDays = Math.max(1, Math.ceil((until - since) / DAY_MS));
  const weekly = spanDays > MAX_TIME_POINTS;
  const bucketMs = weekly ? 7 * DAY_MS : DAY_MS;
  const start = weekly ? startOfUtcDay(since) : startOfUtcDay(since);
  const buckets = new Map<string, { succeeded: number; failed: number }>();
  // Seed contiguous buckets so the line has no gaps.
  for (let t = start; t <= until; t += bucketMs) {
    buckets.set(utcDateKey(t), { succeeded: 0, failed: 0 });
  }
  for (const r of runs) {
    const t = Date.parse(r.startedAt);
    if (Number.isNaN(t) || t < since || t > until) continue;
    const offset = Math.floor((startOfUtcDay(t) - start) / bucketMs) * bucketMs;
    const key = utcDateKey(start + offset);
    const b = buckets.get(key);
    if (!b) continue;
    if (r.status === "succeeded") b.succeeded += 1;
    else b.failed += 1;
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({ date, succeeded: v.succeeded, failed: v.failed }));
}

function buildWorkflowStats(
  runs: readonly AnalyticsRunRow[],
  nameById: ReadonlyMap<string, string>,
): AnalyticsWorkflowStat[] {
  const agg = new Map<
    string,
    { runs: number; succeeded: number; durSum: number; durCount: number }
  >();
  for (const r of runs) {
    const a = agg.get(r.workflowId) ?? { runs: 0, succeeded: 0, durSum: 0, durCount: 0 };
    a.runs += 1;
    if (r.status === "succeeded") a.succeeded += 1;
    const d = durationMs(r.startedAt, r.finishedAt);
    if (d !== null) {
      a.durSum += d;
      a.durCount += 1;
    }
    agg.set(r.workflowId, a);
  }
  return Array.from(agg.entries())
    .map(([workflowId, a]) => ({
      workflowId,
      name: nameById.get(workflowId) ?? "Untitled workflow",
      runs: a.runs,
      succeeded: a.succeeded,
      successRate: a.runs > 0 ? a.succeeded / a.runs : 0,
      avgDurationMs: a.durCount > 0 ? Math.round(a.durSum / a.durCount) : null,
    }))
    .sort((x, y) => y.runs - x.runs);
}

function buildApps(apps: readonly RawAnalyticsApp[]): AnalyticsAppStat[] {
  const counts = new Map<string, { label: string; connections: number }>();
  for (const a of apps) {
    const c = counts.get(a.provider) ?? { label: a.label, connections: 0 };
    c.connections += 1;
    counts.set(a.provider, c);
  }
  return Array.from(counts.entries())
    .map(([provider, c]) => ({ provider, label: c.label, connections: c.connections }))
    .sort((x, y) => y.connections - x.connections);
}

function buildHeatmap(runs: readonly AnalyticsRunRow[], now: number): AnalyticsHeatmap {
  const cells = new Array<number>(HEATMAP_WEEKS * 7).fill(0);
  const today = startOfUtcDay(now);
  const dow = new Date(today).getUTCDay(); // 0=Sun..6=Sat
  const endDate = today + (6 - dow) * DAY_MS; // Saturday of the current week
  const gridStart = endDate - (HEATMAP_WEEKS * 7 - 1) * DAY_MS;
  let total = 0;
  let maxCell = 0;
  for (const r of runs) {
    const t = Date.parse(r.startedAt);
    if (Number.isNaN(t)) continue;
    const idx = Math.floor((startOfUtcDay(t) - gridStart) / DAY_MS);
    if (idx < 0 || idx >= cells.length) continue;
    const next = (cells[idx] ?? 0) + 1;
    cells[idx] = next;
    total += 1;
    if (next > maxCell) maxCell = next;
  }
  return { weeks: HEATMAP_WEEKS, cells, maxCell, total };
}

function buildRecentRuns(
  runs: readonly AnalyticsRunRow[],
  nameById: ReadonlyMap<string, string>,
  limit = 8,
): AnalyticsRecentRun[] {
  // `runs` arrive newest-first from the reader.
  return runs.slice(0, limit).map((r) => ({
    id: r.id,
    workflowName: nameById.get(r.workflowId) ?? "Untitled workflow",
    status: r.status,
    startedAt: r.startedAt,
    durationMs: durationMs(r.startedAt, r.finishedAt),
  }));
}

export function buildAnalyticsOverview(input: BuildOverviewInput): AnalyticsOverview {
  const { since, until, prevSince } = computeRangeWindow(input.range, input.now);

  // Exclude test runs from all aggregates (production-activity view).
  const realRuns = input.runs.filter((r) => !r.isTest);
  const inRange = realRuns.filter((r) => {
    const t = Date.parse(r.startedAt);
    return !Number.isNaN(t) && t >= since && t <= until;
  });
  const inPrev = realRuns.filter((r) => {
    const t = Date.parse(r.startedAt);
    return !Number.isNaN(t) && t >= prevSince && t < since;
  });

  const nameById = new Map(input.workflows.map((w) => [w.id, w.name]));
  const activeWorkflows = input.workflows.filter((w) => w.state === "active").length;
  const totalWorkflows = input.workflows.length;
  const apps = buildApps(input.apps);
  const connectedApps = apps.length;

  return {
    range: {
      id: input.range,
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
    },
    totals: totalsFor(inRange, activeWorkflows, totalWorkflows, connectedApps),
    previousTotals: totalsFor(inPrev, activeWorkflows, totalWorkflows, connectedApps),
    runsOverTime: buildRunsOverTime(inRange, since, until),
    workflows: buildWorkflowStats(inRange, nameById),
    apps,
    heatmap: buildHeatmap(realRuns, input.now),
    recentRuns: buildRecentRuns(inRange, nameById),
    truncated: input.truncated,
  };
}

/**
 * Fetch + build the account analytics overview. Account scope is the caller's
 * responsibility: `accountId` MUST be resolved from the caller's own session
 * (`resolveActiveAccount` / `requireUserWithAccount`) before calling. The run
 * reader, workflow reader, and integration reader are all account-filtered.
 */
export async function getAnalyticsOverview(
  accountId: string,
  range: AnalyticsRange,
): Promise<AnalyticsOverview> {
  const now = Date.now();
  const fetchSince = new Date(analyticsFetchSince(range, now)).toISOString();
  const ANALYTICS_RUN_CAP = 5000;

  const [runs, workflows, integrations] = await Promise.all([
    workflowRunsRepo.listForAnalytics(accountId, {
      since: fetchSince,
      limit: ANALYTICS_RUN_CAP,
    }),
    workflowsRepo.listByAccount(accountId),
    integrationsRepo.listActiveByAccount(accountId),
  ]);

  const apps: RawAnalyticsApp[] = integrations.map((i) => ({
    provider: i.provider,
    label: getProvider(i.provider)?.displayName ?? i.provider,
  }));

  return buildAnalyticsOverview({
    range,
    now,
    runs,
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, state: w.state })),
    apps,
    truncated: runs.length >= ANALYTICS_RUN_CAP,
  });
}
