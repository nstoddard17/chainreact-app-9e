import {
  AnalyticsWidgetsSchema,
  type AnalyticsDashboard,
  type AnalyticsWidget,
} from "@/contracts/analytics";
import * as repo from "@/repositories/analyticsDashboards";
import type { AnalyticsDashboardRecord } from "@/repositories/analyticsDashboards";

/**
 * Dashboard service (Slice ANALYTICS-1) — account-scoped saved-dashboard CRUD +
 * default-dashboard seeding.
 *
 * Authorization is the ROUTE's responsibility (membership + account match);
 * this layer never decides access. It owns the widget validation (every write +
 * every read re-validates the JSONB through `AnalyticsWidgetsSchema`, so a
 * malformed/legacy board degrades to empty rather than crashing render) and the
 * starter board's contents.
 */

/**
 * The auto-seeded "Overview" board. Every widget binds to a metric the
 * aggregation service actually backs (no-fake-UI) — see contracts/analytics.ts
 * `AnalyticsMetric`. Mirrors the design's starter layout, mapped to real data.
 */
export const DEFAULT_OVERVIEW_WIDGETS: readonly AnalyticsWidget[] = [
  { id: "ov-runs", type: "stat", size: "s", title: "Runs", icon: "Bolt", config: { source: "any", metric: "runs" } },
  { id: "ov-success", type: "stat", size: "s", title: "Success rate", icon: "CircleCheck", config: { source: "any", metric: "success_rate" } },
  { id: "ov-active", type: "stat", size: "s", title: "Active automations", icon: "Layers", config: { source: "any", metric: "active_workflows" } },
  { id: "ov-duration", type: "stat", size: "s", title: "Avg run time", icon: "Clock", config: { source: "any", metric: "avg_duration" } },
  { id: "ov-overtime", type: "line", size: "xl", title: "Runs over time", icon: "History", config: { source: "any", metric: "runs_over_time" } },
  { id: "ov-outcome", type: "donut", size: "s", title: "By outcome", icon: "Filter", config: { source: "any", metric: "outcomes" } },
  { id: "ov-top", type: "bar", size: "m", title: "Top automations by runs", icon: "Layers", config: { source: "any", metric: "top_workflows" } },
  { id: "ov-heatmap", type: "heatmap", size: "l", title: "When your automations run", icon: "Clock", config: { source: "any", metric: "by_time" } },
  { id: "ov-apps", type: "bar", size: "m", title: "Connected apps", icon: "Webhook", config: { source: "any", metric: "by_app" } },
  { id: "ov-recent", type: "activity", size: "m", title: "Recent runs", icon: "History", config: { source: "any", metric: "events" } },
  {
    id: "ov-note",
    type: "note",
    size: "m",
    title: "Welcome to your dashboard",
    icon: "Sparkle",
    config: {
      source: "any",
      note: "This is your account's analytics. Click Edit dashboard to drag, resize, rename, or add widgets, then Done editing to save. Everything reflects your real runs and workflows.",
    },
  },
];

function toDashboard(record: AnalyticsDashboardRecord): AnalyticsDashboard {
  // Defensive: a malformed/legacy widgets blob degrades to an empty board
  // rather than throwing during render.
  const parsed = AnalyticsWidgetsSchema.safeParse(record.widgets);
  const widgets = parsed.success ? parsed.data : [];
  return {
    id: record.id,
    name: record.name,
    position: record.position,
    isDefault: record.isDefault,
    widgets,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * List the account's dashboards, seeding the default "Overview" board on first
 * access. `accountId` + `userId` MUST be the caller's resolved active account +
 * own id (route-authorized).
 */
export async function listOrSeedDashboards(
  accountId: string,
  userId: string,
): Promise<readonly AnalyticsDashboard[]> {
  const existing = await repo.listByAccount(accountId);
  if (existing.length > 0) return existing.map(toDashboard);

  const seeded = await repo.seedDefaultServiceRole({
    accountId,
    createdByUserId: userId,
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets: DEFAULT_OVERVIEW_WIDGETS,
  });
  // null → a concurrent first-load won the seed race (one-default unique index).
  // Re-list so both requests converge on the same single default board.
  if (seeded === null) {
    const after = await repo.listByAccount(accountId);
    return after.map(toDashboard);
  }
  return [toDashboard(seeded)];
}

export async function createDashboard(
  accountId: string,
  userId: string,
  input: { name: string; widgets?: readonly AnalyticsWidget[] },
): Promise<AnalyticsDashboard> {
  const position = await repo.nextPositionServiceRole(accountId);
  const created = await repo.createServiceRole({
    accountId,
    createdByUserId: userId,
    name: input.name,
    position,
    isDefault: false,
    widgets: input.widgets ?? [],
  });
  return toDashboard(created);
}

export async function updateDashboard(
  id: string,
  patch: { name?: string; position?: number; widgets?: readonly AnalyticsWidget[] },
): Promise<AnalyticsDashboard> {
  const updated = await repo.updateServiceRole(id, patch);
  return toDashboard(updated);
}

export async function deleteDashboard(id: string): Promise<void> {
  await repo.deleteServiceRole(id);
}

/** Load a dashboard's owning account for write-path authorization (or null). */
export async function getDashboardAccount(
  id: string,
): Promise<{ accountId: string; isDefault: boolean } | null> {
  const record = await repo.getByIdServiceRole(id);
  if (!record) return null;
  return { accountId: record.accountId, isDefault: record.isDefault };
}
