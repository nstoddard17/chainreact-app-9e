import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";
import { findFirstAvailableRect } from "./findFirstAvailableRect";
import { validateLayout } from "./validateLayout";
import { layoutFailure, type AnalyticsLayout, type LayoutResult, type PlacedWidget } from "./types";

/**
 * Responsive projection (ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1).
 *
 * ONE layout is persisted — the canonical four-column arrangement. Narrower
 * screens get a DERIVED view of it, computed here and thrown away on the next
 * render. Nothing in this file writes, and nothing that comes out of it may be
 * persisted: a projection is a picture of the layout, not the layout.
 *
 * That asymmetry is deliberate. At four columns the canonical arrangement is
 * reproduced EXACTLY, gaps and all, because those gaps are the user's authored
 * intent. Below four columns a gap is no longer meaningful — a hole on a phone
 * is just wasted screen — so the projection compacts. Compaction is safe here
 * precisely because it cannot travel back: the canonical rectangles are never
 * touched, so widening the window restores the original board exactly.
 *
 * Projection is NOT the placement engine. It does not push widgets down around
 * canonical coordinates; it re-reads the board in visual order and repacks it
 * into a narrower grid by first fit. Push-down would try to preserve positions
 * that cannot survive the narrowing, and would leave holes and stragglers.
 */

export type AnalyticsColumnCount = 1 | 2 | 3 | 4;

/**
 * The narrowest a cell may be before the board stops being readable.
 *
 * 220px is the measured floor for the shipping card: it holds the header
 * (grip + icon + a truncated title + up to four edit controls) without the
 * controls wrapping, and leaves a usable body for a stat value or a chart. Four
 * of them plus three gaps need 922px of grid — comfortably inside a 1280px
 * desktop once the app's sidebar and page padding are taken off, and comfortably
 * OUTSIDE a tablet, which is the intent: four columns should fit properly or not
 * be used at all.
 *
 * ONE definition. Nothing else picks a breakpoint number.
 */
export const ANALYTICS_MIN_CELL_WIDTH_PX = 220;

/** Kept in step with the renderer's gap. */
const GAP_PX = 14;

/**
 * How many columns a container of this width can actually show.
 *
 * Driven by the GRID CONTAINER's width, never `window.innerWidth`: the grid sits
 * inside a page whose sidebar, padding and any future rail all consume width the
 * viewport number knows nothing about. Two users at the same window size can
 * have very different grids.
 *
 * An unmeasured, zero or nonsense width falls back to the canonical count rather
 * than to 1 — a first paint that briefly shows the real board is honest, whereas
 * one that briefly shows a phone layout on a desktop looks broken.
 */
export function columnsForContainerWidth(width: number): AnalyticsColumnCount {
  if (!Number.isFinite(width) || width <= 0) return ANALYTICS_CANONICAL_COLUMNS;
  const possible = Math.floor(
    (width + GAP_PX) / (ANALYTICS_MIN_CELL_WIDTH_PX + GAP_PX),
  );
  return Math.min(Math.max(possible, 1), ANALYTICS_CANONICAL_COLUMNS) as AnalyticsColumnCount;
}

/** The minimum width the four-column EDITING surface needs to stay usable. */
export const ANALYTICS_CANONICAL_MIN_WIDTH_PX =
  ANALYTICS_CANONICAL_COLUMNS * ANALYTICS_MIN_CELL_WIDTH_PX +
  (ANALYTICS_CANONICAL_COLUMNS - 1) * GAP_PX;

/**
 * Canonical visual reading order — the order a person sees the board in, which
 * is what a narrow stack must follow. Deliberately NOT the persisted array
 * order: the two can differ, and a phone reading order that disagreed with the
 * desktop one would be disorienting.
 */
function readingOrder(layout: AnalyticsLayout): PlacedWidget[] {
  return layout
    .map((placement, index) => ({ placement, index }))
    .sort((a, b) => {
      if (a.placement.y !== b.placement.y) return a.placement.y - b.placement.y;
      if (a.placement.x !== b.placement.x) return a.placement.x - b.placement.x;
      if (a.index !== b.index) return a.index - b.index;
      return a.placement.widgetId < b.placement.widgetId ? -1 : 1;
    })
    .map((entry) => entry.placement);
}

export function projectLayoutToColumns(
  canonicalLayout: AnalyticsLayout,
  targetColumnCount: AnalyticsColumnCount,
): LayoutResult {
  const canonical = validateLayout(canonicalLayout, ANALYTICS_CANONICAL_COLUMNS);
  if (!canonical.ok) {
    return layoutFailure(
      "collision-unresolved",
      `Cannot project an invalid canonical layout: ${canonical.problems
        .map((p) => p.code)
        .join(", ")}.`,
    );
  }

  // Four columns IS the canonical grid. Identity, by reference — no repack, no
  // compaction, no reordering, and no new objects for React to churn on.
  if (targetColumnCount === ANALYTICS_CANONICAL_COLUMNS) {
    return { ok: true, layout: canonicalLayout };
  }

  const projected: PlacedWidget[] = [];
  for (const placement of readingOrder(canonicalLayout)) {
    // A widget wider than the target grid becomes full-width. Height is
    // canonical and never clamped: a chart that needs two rows still needs them.
    const w = Math.min(placement.w, targetColumnCount);
    const rect = findFirstAvailableRect(projected, { w, h: placement.h }, targetColumnCount);
    if (!rect) {
      return layoutFailure(
        "exceeds-columns",
        `Widget "${placement.widgetId}" cannot be projected into ${targetColumnCount} columns.`,
      );
    }
    projected.push({ widgetId: placement.widgetId, ...rect });
  }

  const check = validateLayout(projected, targetColumnCount);
  if (!check.ok) {
    return layoutFailure(
      "collision-unresolved",
      `Projection produced an invalid layout: ${check.problems.map((p) => p.code).join(", ")}.`,
    );
  }
  return { ok: true, layout: projected };
}
