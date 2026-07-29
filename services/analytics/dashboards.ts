import { type AnalyticsDashboard, type AnalyticsWidget } from "@/contracts/analytics";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import {
  normalizeDashboardWidgets,
  validateLayout,
  type NormalizedDashboardWidgets,
} from "@/core/analytics/layout";
import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";
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
 * The auto-seeded "Overview" board. Definitions live in
 * `contracts/analyticsDefaults.ts` (CD-3B) so the client's restore-default
 * action can write the SAME canonical layout the server seeds; re-exported
 * here so existing server-side importers are unchanged.
 */
export { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";

/**
 * The single read chokepoint (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1).
 *
 * Widget validation, the CD-3A defensive degradation, and — since S2 — the
 * separation of PERSISTED widget data from the EFFECTIVE canonical layout all
 * happen here and nowhere else. The normalizer is pure and does no I/O; this
 * function adds only the diagnostic. Notably it performs NO WRITE: a legacy
 * board that needs derived rectangles to render gets them in memory and its
 * stored JSON is left exactly as it was.
 */
function normalize(record: AnalyticsDashboardRecord): NormalizedDashboardWidgets {
  const normalized = normalizeDashboardWidgets(record.widgets);
  if (normalized.layoutProblems.length > 0) {
    // Codes, widget ids and the dashboard id only — never titles, configs, or
    // any other stored user content.
    console.warn("[analytics] dashboard layout normalized with problems", {
      dashboardId: record.id,
      layoutSource: normalized.layoutSource,
      problems: normalized.layoutProblems.map((p) => ({
        code: p.code,
        widgetIds: p.widgetIds,
      })),
    });
  }
  return normalized;
}

function toDashboard(record: AnalyticsDashboardRecord): AnalyticsDashboard {
  // The API payload deliberately carries only the persisted widgets — the
  // effective layout stays server-side until the renderer consumes it in a
  // later stage, so this release does not broaden the client contract.
  return {
    id: record.id,
    name: record.name,
    position: record.position,
    isDefault: record.isDefault,
    widgets: [...normalize(record).widgets],
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

/**
 * Why a submitted board cannot be stored, or `null` when it can
 * (ANALYTICS-EXPLICIT-LAYOUT-S2.5-BOUNDARY-REALIGN-1).
 *
 * Zod validates one widget at a time and cannot see the SET: two individually
 * legal rectangles can still sit on top of each other. This is the server's
 * last line before an explicit board is stored, so the read path never has to
 * repair something a client could simply have been stopped from saving.
 *
 * It lives HERE, not in the route, because deciding whether a board is a valid
 * arrangement is a layout rule — the route's job is to turn this answer into an
 * HTTP response. `issues` carries problem codes and widget ids only; never a
 * title, config, note, or any other stored user content.
 *
 * A board with NO placement — every legacy board, and every board this release's
 * UI produces — is accepted untouched: nothing here nudges a save toward
 * explicit layout.
 */
export interface DashboardLayoutRejection {
  readonly message: string;
  readonly issues?: readonly { readonly code: string; readonly widgetIds: readonly string[] }[];
}

export function checkDashboardLayout(
  widgets: readonly AnalyticsWidget[] | undefined,
): DashboardLayoutRejection | null {
  if (!widgets || widgets.length === 0) return null;
  const placed = widgets.filter((w) => w.layout);
  if (placed.length === 0) return null;
  if (placed.length < widgets.length) {
    return {
      message:
        "Every widget must carry a placement, or none may. A partly-placed dashboard cannot be saved.",
    };
  }
  const validation = validateLayout(
    widgets.map((w) => ({
      widgetId: w.id,
      x: w.layout!.x,
      y: w.layout!.y,
      w: w.layout!.w,
      h: w.layout!.h,
    })),
    ANALYTICS_CANONICAL_COLUMNS,
  );
  if (validation.ok) return null;
  return {
    message: "The dashboard layout is not valid.",
    issues: validation.problems.map((p) => ({ code: p.code, widgetIds: p.widgetIds })),
  };
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
