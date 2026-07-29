import type { GridRect } from "./types";

/**
 * Rectangle arithmetic (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1). Pure, total,
 * and the single definition of "these two widgets are in each other's way".
 */

/**
 * Do two rectangles share at least one cell?
 *
 * Half-open on both axes, so EDGE-TOUCHING RECTANGLES DO NOT OVERLAP: a widget
 * ending at column 2 and one starting at column 2 are neighbours, not a
 * collision. Getting this wrong would make every board look permanently
 * invalid and would push widgets that were never in the way.
 */
export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The row immediately below a rectangle — where a displaced widget clears it. */
export function bottomOf(rect: GridRect): number {
  return rect.y + rect.h;
}

/** The column immediately right of a rectangle. */
export function rightOf(rect: GridRect): number {
  return rect.x + rect.w;
}

/**
 * Is this a rectangle the engine will accept at all? Coordinates must be whole
 * cells (a half-cell placement has no meaning in a grid), origins non-negative,
 * and dimensions at least one cell.
 *
 * Column-boundary overflow is deliberately NOT checked here — it depends on the
 * board's column count, and callers report it as a distinct failure so the UI
 * can say "that doesn't fit across" rather than "that's invalid".
 */
export function isWellFormedRect(rect: GridRect): boolean {
  return (
    Number.isInteger(rect.x) &&
    Number.isInteger(rect.y) &&
    Number.isInteger(rect.w) &&
    Number.isInteger(rect.h) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w >= 1 &&
    rect.h >= 1
  );
}

/** Does the rectangle fit across a board this wide? */
export function fitsWithinColumns(rect: GridRect, columnCount: number): boolean {
  return rect.x + rect.w <= columnCount;
}

/** The first row below everything currently placed — always free, at any x. */
export function lowestBottom(rects: readonly GridRect[]): number {
  let bottom = 0;
  for (const rect of rects) {
    const b = bottomOf(rect);
    if (b > bottom) bottom = b;
  }
  return bottom;
}
