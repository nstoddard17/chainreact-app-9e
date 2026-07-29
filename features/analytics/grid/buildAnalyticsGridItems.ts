import {
  ANALYTICS_CANONICAL_COLUMNS,
  footprintForSize,
  type AnalyticsWidget,
} from "@/contracts/analytics";
import { validateLayout, type AnalyticsLayout, type PlacedWidget } from "@/core/analytics/layout";

/**
 * Widget ↔ placement view model (ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1).
 *
 * PURE, and feature-level on purpose: it owns no arithmetic. Overlap, bounds and
 * duplicate-id checking are delegated to the core engine's `validateLayout`, and
 * footprints come from the contract's size map. What this adds is the *pairing*
 * — which is a rendering concern, because a renderer cannot draw a widget it has
 * no rectangle for, nor a rectangle with no widget.
 *
 * It refuses rather than improvises. The old renderer's defining failure was
 * that a widget with no usable position still appeared *somewhere*, because CSS
 * auto-flow always has an answer; that is precisely how the arrangement on
 * screen drifted away from the stored one. Here an unmatched widget is a typed
 * failure, never a silently-omitted or silently-relocated card.
 */

export interface AnalyticsGridItem {
  readonly widget: AnalyticsWidget;
  readonly placement: PlacedWidget;
  /** Index in the caller's widget array — the last-resort ordering tie-break. */
  readonly originalIndex: number;
}

export type AnalyticsGridItemsProblemCode =
  /** A widget has no rectangle. */
  | "missing-placement"
  /** A rectangle names a widget that is not on the board. */
  | "orphan-placement"
  | "duplicate-widget-id"
  | "duplicate-placement-id"
  /** A rectangle's dimensions contradict its widget's size preset. */
  | "size-layout-mismatch"
  /** The board overlaps, leaves the grid, or is otherwise not renderable. */
  | "invalid-layout";

export interface AnalyticsGridItemsProblem {
  readonly code: AnalyticsGridItemsProblemCode;
  /** Widget ids only — never a title, config, note or other stored content. */
  readonly widgetIds: readonly string[];
  /** Developer-facing. Safe to log; never rendered to a user as-is. */
  readonly message: string;
}

export type AnalyticsGridItemsResult =
  | { readonly ok: true; readonly items: readonly AnalyticsGridItem[] }
  | { readonly ok: false; readonly problems: readonly AnalyticsGridItemsProblem[] };

/**
 * Visual reading order: down the rows, then across, with deterministic
 * tie-breaks so the same board always produces the same DOM. Two widgets can
 * never share a cell in a valid layout, so `y`/`x` alone decides it in practice;
 * the remaining keys exist so an unusual board still has ONE answer.
 */
function compareReadingOrder(a: AnalyticsGridItem, b: AnalyticsGridItem): number {
  if (a.placement.y !== b.placement.y) return a.placement.y - b.placement.y;
  if (a.placement.x !== b.placement.x) return a.placement.x - b.placement.x;
  if (a.originalIndex !== b.originalIndex) return a.originalIndex - b.originalIndex;
  return a.widget.id < b.widget.id ? -1 : 1;
}

export function buildAnalyticsGridItems(
  widgets: readonly AnalyticsWidget[],
  layout: AnalyticsLayout,
  options: { readonly columnCount?: number } = {},
): AnalyticsGridItemsResult {
  const columnCount = options.columnCount ?? ANALYTICS_CANONICAL_COLUMNS;
  const problems: AnalyticsGridItemsProblem[] = [];

  const duplicateWidgetIds = duplicatesIn(widgets.map((w) => w.id));
  if (duplicateWidgetIds.length > 0) {
    problems.push({
      code: "duplicate-widget-id",
      widgetIds: duplicateWidgetIds,
      message: "The same widget appears more than once on this board.",
    });
  }

  const duplicatePlacementIds = duplicatesIn(layout.map((p) => p.widgetId));
  if (duplicatePlacementIds.length > 0) {
    problems.push({
      code: "duplicate-placement-id",
      widgetIds: duplicatePlacementIds,
      message: "The same widget is placed more than once in this layout.",
    });
  }

  const placementById = new Map<string, PlacedWidget>();
  for (const placement of layout) {
    if (!placementById.has(placement.widgetId)) placementById.set(placement.widgetId, placement);
  }
  const widgetIds = new Set(widgets.map((w) => w.id));

  const orphans = layout.filter((p) => !widgetIds.has(p.widgetId)).map((p) => p.widgetId);
  if (orphans.length > 0) {
    problems.push({
      code: "orphan-placement",
      widgetIds: [...new Set(orphans)],
      message: "The layout places widgets that are not on this board.",
    });
  }

  const items: AnalyticsGridItem[] = [];
  const unplaced: string[] = [];
  const mismatched: string[] = [];
  widgets.forEach((widget, originalIndex) => {
    const placement = placementById.get(widget.id);
    if (!placement) {
      // NEVER dropped quietly — an unplaced widget fails the whole view model.
      unplaced.push(widget.id);
      return;
    }
    const footprint = footprintForSize(widget.size);
    if (placement.w !== footprint.w || placement.h !== footprint.h) mismatched.push(widget.id);
    items.push({ widget, placement, originalIndex });
  });

  if (unplaced.length > 0) {
    problems.push({
      code: "missing-placement",
      widgetIds: unplaced,
      message: "Some widgets have no position in this layout.",
    });
  }
  if (mismatched.length > 0) {
    problems.push({
      code: "size-layout-mismatch",
      widgetIds: mismatched,
      message: "Some widgets are placed at a size that does not match their size preset.",
    });
  }

  const validation = validateLayout(layout, columnCount);
  if (!validation.ok) {
    problems.push({
      code: "invalid-layout",
      widgetIds: [...new Set(validation.problems.flatMap((p) => p.widgetIds))],
      message: `This layout cannot be rendered: ${validation.problems
        .map((p) => p.code)
        .join(", ")}.`,
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  // Sorting a COPY; the caller's arrays are never touched.
  return { ok: true, items: [...items].sort(compareReadingOrder) };
}

function duplicatesIn(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}
