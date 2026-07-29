import { lowestBottom, rectsOverlap } from "./geometry";
import type { AnalyticsLayout, GridRect } from "./types";

/**
 * First-fit placement (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * Scans top row to bottom row, and left to right within each row, returning the
 * first rectangle where the WHOLE footprint fits with no overlap. Unlike CSS
 * sparse auto-flow — the model this engine replaces — the scan restarts from
 * row 0 for every widget, so an opening left by a wider neighbour IS reused.
 * That is the behaviour "add a widget into the first fitting gap" and the
 * canonical legacy migration both need.
 *
 * Always succeeds when the footprint is narrow enough for the board: the row
 * below everything placed is free at every column, and the scan reaches it.
 * Returns `null` only when the footprint can never fit — `w > columnCount` or a
 * malformed size — so the caller can report that rather than loop forever.
 */
export function findFirstAvailableRect(
  layout: AnalyticsLayout,
  size: { readonly w: number; readonly h: number },
  columnCount: number,
): GridRect | null {
  const { w, h } = size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return null;
  if (w > columnCount) return null;

  // Scanning one row PAST everything placed is enough: that row is empty across
  // the full width, so column 0 always fits there.
  const lastRowToTry = lowestBottom(layout);
  for (let y = 0; y <= lastRowToTry; y += 1) {
    for (let x = 0; x + w <= columnCount; x += 1) {
      const candidate: GridRect = { x, y, w, h };
      if (!layout.some((placed) => rectsOverlap(candidate, placed))) return candidate;
    }
  }
  // Unreachable while the loop bound above holds; kept so a future change to
  // the bound degrades to "append below the board" instead of returning null.
  return { x: 0, y: lastRowToTry, w, h };
}
