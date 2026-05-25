import * as taskUsageEventsRepo from "@/repositories/taskUsageEvents";
import type {
  TaskUsageAnalyticsQuery,
  TaskUsageEventRecord,
} from "@/repositories/taskUsageEvents";

/**
 * Owner/admin task-usage analytics (Slice 4.COST-7) — READ ONLY.
 *
 * Answers owner questions over the `task_usage_events` ledger (COST-3):
 * how many tasks are used, which providers / node-types / workflows / users
 * are most expensive, estimated vs actual usage, billable vs non-billable,
 * test-mode volume, and policy-version / charge-on / reason breakdowns.
 *
 * Two layers:
 *  - PURE fold functions (`summarize*`, `group*`, `rank*`) — no I/O, take rows,
 *    return aggregates. These are the unit-tested core (synthetic events).
 *  - Async owner functions (`get*`) — thin wrappers that load rows via the
 *    repo's owner/admin range read (service-role, RLS-bypassing) and fold them.
 *
 * SECURITY / REDACTION: outputs contain ONLY ids, counts, providers, node
 * types, task amounts, enums (event_type / charge_on / cost_reason), policy
 * versions, and timestamps. The fold functions NEVER read `event.metadata`,
 * so no raw config / secrets / payloads can leak into an aggregate by
 * construction.
 *
 * ACCESS MODEL (documented, not enforced here): the `get*` functions read
 * cross-user data via service-role and are for OWNER/ADMIN callers only. A
 * future admin route must gate them behind an admin authorization check;
 * normal users must never reach the cross-user aggregates. Per-user surfaces
 * pass an explicit `userId` (still owner-gated) or use the RLS read paths.
 */

export type TaskUsageDateRange = {
  from?: string;
  to?: string;
};

// ─── Aggregate shapes ─────────────────────────────────────────────────────────

export interface TaskUsageOverview {
  totalEvents: number;
  totalTasksCharged: number;
  totalEstimatedTasks: number;
  totalActualTasks: number;
  billableEventCount: number;
  nonBillableEventCount: number;
  testModeEventCount: number;
  byEventType: Record<string, number>;
  byChargeOn: Record<string, number>;
  byCostReason: Record<string, number>;
  byCostPolicyVersion: Record<string, number>;
}

export interface TaskGroupStat {
  count: number;
  tasksCharged: number;
  estimatedTasks: number;
  actualTasks: number;
  billableCount: number;
}

/** A ranked group entry (`key` is provider / node-type / workflow id / user id). */
export interface RankedTaskGroup extends TaskGroupStat {
  key: string;
}

// ─── Pure folds ───────────────────────────────────────────────────────────────

function emptyGroup(): TaskGroupStat {
  return {
    count: 0,
    tasksCharged: 0,
    estimatedTasks: 0,
    actualTasks: 0,
    billableCount: 0,
  };
}

function accumulate(stat: TaskGroupStat, e: TaskUsageEventRecord): void {
  stat.count += 1;
  stat.tasksCharged += e.tasksCharged ?? 0;
  stat.estimatedTasks += e.estimatedTasks ?? 0;
  stat.actualTasks += e.actualTasks ?? 0;
  if (e.billable) stat.billableCount += 1;
}

function groupBy(
  events: readonly TaskUsageEventRecord[],
  keyFn: (e: TaskUsageEventRecord) => string | null,
): Record<string, TaskGroupStat> {
  const out: Record<string, TaskGroupStat> = {};
  for (const e of events) {
    const key = keyFn(e);
    if (key === null) continue;
    (out[key] ??= emptyGroup());
    accumulate(out[key], e);
  }
  return out;
}

function bump(rec: Record<string, number>, key: string | null | undefined): void {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
}

/** Top-level roll-up over a set of task usage events. */
export function summarizeTaskUsageEvents(
  events: readonly TaskUsageEventRecord[],
): TaskUsageOverview {
  const overview: TaskUsageOverview = {
    totalEvents: events.length,
    totalTasksCharged: 0,
    totalEstimatedTasks: 0,
    totalActualTasks: 0,
    billableEventCount: 0,
    nonBillableEventCount: 0,
    testModeEventCount: 0,
    byEventType: {},
    byChargeOn: {},
    byCostReason: {},
    byCostPolicyVersion: {},
  };
  for (const e of events) {
    overview.totalTasksCharged += e.tasksCharged ?? 0;
    overview.totalEstimatedTasks += e.estimatedTasks ?? 0;
    overview.totalActualTasks += e.actualTasks ?? 0;
    if (e.billable) overview.billableEventCount += 1;
    else overview.nonBillableEventCount += 1;
    if (e.testMode) overview.testModeEventCount += 1;
    bump(overview.byEventType, e.eventType);
    bump(overview.byChargeOn, e.chargeOn);
    bump(overview.byCostReason, e.costReason);
    bump(overview.byCostPolicyVersion, e.costPolicyVersion);
  }
  return overview;
}

/** Group by provider (events with no provider — e.g. run estimates — are skipped). */
export function groupTaskUsageByProvider(
  events: readonly TaskUsageEventRecord[],
): Record<string, TaskGroupStat> {
  return groupBy(events, (e) => e.provider ?? null);
}

/** Group by `provider:nodeType` (action identity). Events with no node-type are skipped. */
export function groupTaskUsageByNodeType(
  events: readonly TaskUsageEventRecord[],
): Record<string, TaskGroupStat> {
  return groupBy(events, (e) =>
    e.nodeType ? (e.provider ? `${e.provider}:${e.nodeType}` : e.nodeType) : null,
  );
}

/** Group by workflow id. Events with no workflow (already-deleted) are skipped. */
export function groupTaskUsageByWorkflow(
  events: readonly TaskUsageEventRecord[],
): Record<string, TaskGroupStat> {
  return groupBy(events, (e) => e.workflowId ?? null);
}

/** Group by user id. */
export function groupTaskUsageByUser(
  events: readonly TaskUsageEventRecord[],
): Record<string, TaskGroupStat> {
  return groupBy(events, (e) => e.userId ?? null);
}

/** Rank a grouping by `tasksCharged` (desc), tie-broken by count, then key. */
export function rankTaskGroups(
  groups: Record<string, TaskGroupStat>,
  limit?: number,
): RankedTaskGroup[] {
  const ranked = Object.entries(groups)
    .map(([key, stat]) => ({ key, ...stat }))
    .sort(
      (a, b) =>
        b.tasksCharged - a.tasksCharged ||
        b.count - a.count ||
        a.key.localeCompare(b.key),
    );
  return limit !== undefined ? ranked.slice(0, limit) : ranked;
}

// ─── Async owner/admin functions (load + fold) ───────────────────────────────

async function load(
  q: TaskUsageAnalyticsQuery,
): Promise<readonly TaskUsageEventRecord[]> {
  return taskUsageEventsRepo.listEventsForAnalytics(q);
}

/** Owner overview across all users in a date range. */
export async function getTaskUsageOverview(
  range: TaskUsageDateRange = {},
): Promise<TaskUsageOverview> {
  return summarizeTaskUsageEvents(await load(range));
}

/** Owner per-provider task usage in a date range. */
export async function getTaskUsageByProvider(
  range: TaskUsageDateRange = {},
): Promise<Record<string, TaskGroupStat>> {
  return groupTaskUsageByProvider(await load(range));
}

/** Owner per-node-type (`provider:type`) task usage in a date range. */
export async function getTaskUsageByNodeType(
  range: TaskUsageDateRange = {},
): Promise<Record<string, TaskGroupStat>> {
  return groupTaskUsageByNodeType(await load(range));
}

/** Owner per-workflow task usage in a date range, ranked by tasks charged. */
export async function getTaskUsageByWorkflow(
  args: TaskUsageDateRange & { limit?: number } = {},
): Promise<RankedTaskGroup[]> {
  const { limit, ...range } = args;
  return rankTaskGroups(groupTaskUsageByWorkflow(await load(range)), limit);
}

/** Owner "most expensive workflows" in a date range (alias of ranked per-workflow). */
export async function getMostExpensiveWorkflows(
  args: TaskUsageDateRange & { limit?: number } = {},
): Promise<RankedTaskGroup[]> {
  return getTaskUsageByWorkflow(args);
}

/** Owner per-user task usage in a date range, ranked by tasks charged. */
export async function getTaskUsageByUser(
  args: TaskUsageDateRange & { limit?: number } = {},
): Promise<RankedTaskGroup[]> {
  const { limit, ...range } = args;
  return rankTaskGroups(groupTaskUsageByUser(await load(range)), limit);
}

/** Owner overview scoped to a single user (still an owner/admin read). */
export async function getTaskUsageForUser(
  args: { userId: string } & TaskUsageDateRange,
): Promise<TaskUsageOverview> {
  return summarizeTaskUsageEvents(await load(args));
}
