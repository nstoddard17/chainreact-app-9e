import type { CSSProperties } from "react";
import type { GridRect } from "@/core/analytics/layout";
import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";

/**
 * The explicit grid's geometry (ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1).
 *
 * ONE row unit, fixed. The layout engine treats `h` as a count of equal rows, so
 * a row whose height depends on its content would make the engine's arithmetic
 * and the rendered pixels disagree — and the drag system that measures this grid
 * in S4 would inherit that disagreement as jitter. The shipping grid today uses
 * `minmax(190px, auto)`, which lets a tall card stretch its track; the explicit
 * grid deliberately does not.
 *
 * TRADE-OFF, recorded: content taller than its footprint is bounded by the cell
 * rather than growing it. That is consistent with the existing widget design,
 * whose card is already `overflow-hidden` with a `min-h-0 flex-1` body — the
 * cards were never intended to grow. What changes is that they now *cannot*.
 *
 * Both values match the shipping grid exactly (`gap-3.5` = 14px, 190px rows), so
 * a board renders at the same size in either renderer.
 */

/** Height of one grid row, in CSS pixels. */
export const ANALYTICS_GRID_ROW_HEIGHT_PX = 190;

/** Gap between rows and columns, in CSS pixels. Tailwind `gap-3.5`. */
export const ANALYTICS_GRID_GAP_PX = 14;

/** CSS custom properties the grid element publishes, for tests and for S4. */
export const ANALYTICS_GRID_ROW_HEIGHT_VAR = "--analytics-grid-row-height";
export const ANALYTICS_GRID_GAP_VAR = "--analytics-grid-gap";

/**
 * The height a footprint of `h` rows occupies, gaps included. The engine's
 * `h` counts ROWS; the pixels between them are gaps, not rows — getting that
 * wrong is a one-gap-per-row drift that only shows up on tall widgets.
 */
export function rowSpanHeightPx(h: number): number {
  return h * ANALYTICS_GRID_ROW_HEIGHT_PX + (h - 1) * ANALYTICS_GRID_GAP_PX;
}

/**
 * The CSS placement for one rectangle. Grid lines are 1-based, so a widget at
 * `x = 0` starts at column line 1.
 *
 * Explicit lines plus spans only — never absolute pixels, transforms, margins
 * that simulate cells, DOM order, or auto-placement. Those are what the audit
 * found the old renderer relying on, and each of them lets the rendered position
 * drift away from the stored rectangle.
 */
export function gridPlacementStyle(rect: GridRect): {
  gridColumnStart: number;
  gridColumnEnd: string;
  gridRowStart: number;
  gridRowEnd: string;
} {
  return {
    gridColumnStart: rect.x + 1,
    gridColumnEnd: `span ${rect.w}`,
    gridRowStart: rect.y + 1,
    gridRowEnd: `span ${rect.h}`,
  };
}

/** The grid container's own style: a fixed four-column track set. */
export function gridContainerStyle(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${ANALYTICS_CANONICAL_COLUMNS}, minmax(0, 1fr))`,
    gridAutoRows: `var(${ANALYTICS_GRID_ROW_HEIGHT_VAR})`,
    gap: `var(${ANALYTICS_GRID_GAP_VAR})`,
    [ANALYTICS_GRID_ROW_HEIGHT_VAR]: `${ANALYTICS_GRID_ROW_HEIGHT_PX}px`,
    [ANALYTICS_GRID_GAP_VAR]: `${ANALYTICS_GRID_GAP_PX}px`,
  } as CSSProperties;
}
