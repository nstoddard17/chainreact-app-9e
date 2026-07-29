import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";
import type { GridRect } from "@/core/analytics/layout";
import { ANALYTICS_GRID_GAP_PX, ANALYTICS_GRID_ROW_HEIGHT_PX } from "./gridGeometry";

/**
 * Pointer → candidate rectangle (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * THE DESTINATION IS A PLACE, NOT A CARD. The audit's central finding was that
 * the old editor could only target rectangles that already had a widget in them,
 * because destinations were built from the rendered cards. Here the destination
 * is derived from the pointer and the grid's own geometry, so every valid cell
 * is reachable — including holes, the space beside a wide widget, and rows that
 * do not exist yet.
 *
 * PURE. No DOM, no React: the caller measures the grid once at drag start and
 * passes the numbers in. That keeps the maths testable and, more importantly,
 * keeps the geometry FROZEN for the whole gesture — the defect that made the
 * original drag oscillate was letting a moving layout redefine the targets.
 */

export interface GridMetrics {
  /** Grid-local width of one column track, in CSS px. */
  readonly columnWidth: number;
  readonly rowHeight: number;
  readonly gap: number;
  readonly columnCount: number;
}

/**
 * Derive the track metrics from the grid's measured width. Columns are
 * `minmax(0, 1fr)`, so each track is the leftover width after the gaps, divided
 * evenly — the same arithmetic the browser does.
 */
export function gridMetricsFromWidth(
  gridWidth: number,
  columnCount: number = ANALYTICS_CANONICAL_COLUMNS,
): GridMetrics {
  const gap = ANALYTICS_GRID_GAP_PX;
  const columnWidth = (gridWidth - gap * (columnCount - 1)) / columnCount;
  return {
    columnWidth: Math.max(columnWidth, 1),
    rowHeight: ANALYTICS_GRID_ROW_HEIGHT_PX,
    gap,
    columnCount,
  };
}

export interface CandidateInput {
  /** Viewport pointer position. */
  readonly pointerX: number;
  readonly pointerY: number;
  /** The grid's current viewport origin. */
  readonly gridLeft: number;
  readonly gridTop: number;
  /** Where inside the dragged card the user grabbed it, captured at drag start. */
  readonly grabDx: number;
  readonly grabDy: number;
  /** The dragged widget's own footprint — never changed by a move. */
  readonly footprint: { readonly w: number; readonly h: number };
  readonly metrics: GridMetrics;
}

/**
 * The cell the dragged widget's TOP-LEFT currently sits nearest to.
 *
 * Nearest-cell rounding, deliberately: the candidate changes when the card's own
 * top-left crosses the half-way point of a track, which is what makes the
 * placeholder land where the user sees the card. Hit-testing whichever card is
 * under the pointer — the old model — is exactly what made the destination
 * depend on a layout that the drag itself was moving.
 *
 * `x` is clamped so the whole footprint stays on the grid; the width is never
 * silently changed to make something fit. `y` is only clamped at the top, so
 * dragging below the board yields a real new row.
 */
export function candidateRectFor(input: CandidateInput): GridRect {
  const { metrics, footprint } = input;
  const localLeft = input.pointerX - input.gridLeft - input.grabDx;
  const localTop = input.pointerY - input.gridTop - input.grabDy;

  const columnPitch = metrics.columnWidth + metrics.gap;
  const rowPitch = metrics.rowHeight + metrics.gap;

  const rawX = Math.round(localLeft / columnPitch);
  const rawY = Math.round(localTop / rowPitch);

  const maxX = Math.max(0, metrics.columnCount - footprint.w);
  return {
    x: Math.min(Math.max(rawX, 0), maxX),
    y: Math.max(rawY, 0),
    w: footprint.w,
    h: footprint.h,
  };
}

/** Two candidates are the same destination when every coordinate matches. */
export function sameRect(a: GridRect | null, b: GridRect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
