"use client";

import { AnalyticsWidgetSchema } from "@/contracts/analytics";
import type {
  AnalyticsDashboard,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsWidget,
  AnalyticsWidgetSize,
  AnalyticsWidgetType,
} from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { WIDGET_LIBRARY } from "./WidgetLibrary";

/** Shared constants + small presentational helpers for AnalyticsDashboard. */

/**
 * Download the active dashboard's layout + currently-loaded data as JSON. Real,
 * client-side export (no server round-trip). `overview` is the internal-source
 * data already in memory; connected-app widget data is fetched per-widget and not
 * included here (documented follow-up).
 */
export function downloadDashboardExport(
  active: AnalyticsDashboard,
  range: AnalyticsRange,
  overview: AnalyticsOverview | null,
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    dashboard: { name: active.name, widgets: active.widgets },
    range,
    overview,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${active.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-analytics.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export const RANGE_OPTIONS: { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "Year" },
];

const DEFAULT_METRIC_BY_TYPE: Record<AnalyticsWidgetType, AnalyticsWidget["config"]["metric"]> = {
  stat: "runs",
  line: "runs_over_time",
  bar: "top_workflows",
  donut: "outcomes",
  heatmap: "by_time",
  table: "top_workflows",
  activity: "events",
  note: undefined,
  // Custom Insights bind through config.insight, not an internal metric.
  insight: undefined,
};

const DEFAULT_SIZE_BY_TYPE: Record<AnalyticsWidgetType, AnalyticsWidgetSize> = {
  stat: "s",
  line: "xl",
  bar: "m",
  donut: "s",
  heatmap: "l",
  table: "m",
  activity: "m",
  note: "m",
  insight: "m",
};

/** Build a fresh widget for a newly-added type with sensible defaults. */
export function makeWidget(type: AnalyticsWidgetType): AnalyticsWidget {
  const meta = WIDGET_LIBRARY.find((w) => w.type === type);
  const metric = DEFAULT_METRIC_BY_TYPE[type];
  return {
    id: `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    type,
    size: DEFAULT_SIZE_BY_TYPE[type],
    title: meta?.name ?? "New widget",
    icon: meta?.icon ?? "Bolt",
    config: {
      source: "any",
      ...(metric ? { metric } : {}),
      ...(type === "note" ? { note: "Type a note for you or your team." } : {}),
    },
  };
}

/** Dashboards cap at 48 widgets (AnalyticsWidgetsSchema). */
export const MAX_DASHBOARD_WIDGETS = 48;

/** Fresh, collision-proof widget id (same scheme as `makeWidget`).
 * Exported for CD-5B's Save-as-new-insight path. */
export function newWidgetId(): string {
  return `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Duplicate a widget (CD-3B). PURE — returns the next widget list, or null
 * when the copy must be refused.
 *
 * Copies only the persisted question: type, size, icon and config. Runtime
 * state (results, freshness, errors, loading, legend visibility) lives in
 * component state and hooks, never in the widget, so it cannot come along.
 * A widget whose stored config no longer parses is refused rather than
 * cloned — duplicating a broken widget would just double the repair work.
 * Exposure is NOT re-checked here: a copied config referencing a
 * non-exposed source renders the same "settings need an update" state its
 * original does, because the catalog is filtered server-side.
 */
export function duplicateWidgetAt(
  widgets: readonly AnalyticsWidget[],
  id: string,
): { widgets: AnalyticsWidget[]; newId: string } | { error: string } {
  const index = widgets.findIndex((w) => w.id === id);
  const source = widgets[index];
  if (index < 0 || !source) return { error: "That widget is no longer on this dashboard." };
  if (widgets.length >= MAX_DASHBOARD_WIDGETS) {
    return { error: `A dashboard can hold up to ${MAX_DASHBOARD_WIDGETS} widgets.` };
  }
  if (!AnalyticsWidgetSchema.safeParse(source).success) {
    return { error: "That widget's settings need to be fixed before it can be copied." };
  }
  const newId = newWidgetId();
  const copy: AnalyticsWidget = {
    ...source,
    id: newId,
    title: `${source.title} copy`.slice(0, 120),
    config: JSON.parse(JSON.stringify(source.config)) as AnalyticsWidget["config"],
  };
  const next = widgets.slice();
  next.splice(index + 1, 0, copy); // sits immediately after its source
  return { widgets: next, newId };
}

/**
 * RETAINED AS HISTORICAL REFERENCE ONLY
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * `DragSlot`, `computeDragPreview` and `hitTestSlot` are the ordered-array drag
 * model that S4 replaced. No production code calls them: the editor now derives
 * a candidate RECTANGLE from the pointer and resolves it through the layout
 * engine, so destinations are places rather than other widgets' boxes.
 *
 * They are kept because the audit's diagnostic suite uses them as the executable
 * record of WHY the old model could not work — a widget-indexed destination list
 * cannot address an empty cell. Deleting them would delete that evidence. Do not
 * call them from new code.
 */

/** One grid slot's geometry, captured at drag start (grid-relative, px). */
export interface DragSlot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The drag preview/commit order (ANALYTICS-WIDGET-DRAG-STABILITY-1). PURE —
 * always derived from the DRAG-START order plus the current destination slot,
 * never from a chain of mutations to whatever preview is on screen. That gives
 * every destination a stable meaning for the whole drag: slot 0 always means
 * the first position, so stepping a widget out and back restores the starting
 * arrangement without the dragged widget ever needing to be a hover target.
 */
export function computeDragPreview(
  startOrder: readonly AnalyticsWidget[],
  draggedId: string,
  destinationSlot: number,
): AnalyticsWidget[] | null {
  const dragged = startOrder.find((w) => w.id === draggedId);
  if (!dragged) return null;
  const rest = startOrder.filter((w) => w.id !== draggedId);
  const at = Math.max(0, Math.min(Math.trunc(destinationSlot), rest.length));
  const next = rest.slice();
  next.splice(at, 0, dragged);
  return next;
}

/**
 * Map a grid-relative point to the slot containing it, or null for a gutter /
 * outside point. Null means "keep the current destination": the gaps between
 * slots are a natural dead zone, so a pointer resting on a boundary cannot
 * flutter between two destinations. Slots come from the drag-start capture and
 * never move mid-drag — animated cards must not redefine collision targets.
 */
export function hitTestSlot(
  slots: readonly DragSlot[],
  x: number,
  y: number,
): number | null {
  for (let i = 0; i < slots.length; i += 1) {
    const s = slots[i]!;
    if (x >= s.left && x < s.left + s.width && y >= s.top && y < s.top + s.height) {
      return i;
    }
  }
  return null;
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive/15"
          onClick={onRetry}
        >
          {retryLabel ?? "Retry"}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive/15"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyDashboard({
  editing,
  canManage,
  onAdd,
  onEdit,
}: {
  editing: boolean;
  canManage: boolean;
  onAdd: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-20 text-center">
      <span className="text-muted-foreground">
        <AnalyticsIcon name="Layers" size={28} />
      </span>
      <div className="text-sm font-medium text-foreground">This dashboard is empty</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        {canManage
          ? "Add widgets to track runs, success rates, top automations, and more — all from your real account activity."
          : "There's nothing here yet. An account owner or admin can add widgets to this dashboard."}
      </p>
      {canManage && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-105"
          onClick={editing ? onAdd : onEdit}
        >
          <AnalyticsIcon name="Plus" size={12} /> {editing ? "Add a widget" : "Edit dashboard"}
        </button>
      )}
    </div>
  );
}
