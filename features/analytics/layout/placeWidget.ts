import { bottomOf, fitsWithinColumns, isWellFormedRect, rectsOverlap } from "./geometry";
import { validateLayout } from "./validateLayout";
import {
  layoutFailure,
  type AnalyticsLayout,
  type GridRect,
  type LayoutResult,
  type PlacedWidget,
  type PlacementOptions,
} from "./types";

/**
 * Push-down placement (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1) — the one
 * operation every move and every resize goes through.
 *
 * POLICY, in full:
 *
 *  1. The candidate lands at EXACTLY the rectangle it asked for. A valid
 *     request is never silently relocated, clamped or "helpfully" adjusted; an
 *     invalid one is refused with a typed reason. This is what makes
 *     preview-equals-commit true by construction — the preview a caller renders
 *     from this result IS what a later commit will write.
 *  2. Every widget whose footprint overlaps the candidate is displaced DOWNWARD
 *     by the smallest number of rows that clears it, and the displacement
 *     cascades to whatever those widgets then collide with.
 *  3. Widgets are NEVER moved up, and NEVER moved sideways. `x` is untouched
 *     for every widget in the board. Sideways displacement is ambiguous with
 *     mixed widths (which way?) and cascades unpredictably.
 *  4. Widgets outside the collision chain are returned UNCHANGED — by identity,
 *     not merely by value, so a caller can cheaply tell what moved.
 *  5. Nothing is ever compacted. A gap the placement creates or preserves
 *     survives. Closing gaps is a separate, explicit, user-invoked action; it
 *     is not part of routine placement and this module never calls it.
 *
 * The result is a typed value, never an exception, and `ok: true` carries a
 * layout that has already been re-validated: no overlaps, nothing off the right
 * edge, no duplicate ids.
 */

/**
 * The displacement order when several widgets collide at once. Fixed and
 * documented so the same board plus the same drop always produces the same
 * result on every machine:
 *
 *   1. original `y` (higher rows settle first, so pushes flow downward)
 *   2. original `x` (left to right within a row)
 *   3. original index in the CALLER-SUPPLIED layout array (a stable, explicit
 *      input — never DOM order and never object key enumeration)
 *   4. `widgetId`, only to break a tie the first three cannot
 */
function compareForDisplacement(
  a: { readonly widget: PlacedWidget; readonly index: number },
  b: { readonly widget: PlacedWidget; readonly index: number },
): number {
  if (a.widget.y !== b.widget.y) return a.widget.y - b.widget.y;
  if (a.widget.x !== b.widget.x) return a.widget.x - b.widget.x;
  if (a.index !== b.index) return a.index - b.index;
  return a.widget.widgetId < b.widget.widgetId ? -1 : 1;
}

export function placeWidget(
  layout: AnalyticsLayout,
  widgetId: string,
  candidateRect: GridRect,
  options: PlacementOptions,
): LayoutResult {
  const { columnCount } = options;

  if (!layout.some((w) => w.widgetId === widgetId)) {
    return layoutFailure("unknown-widget", `No widget "${widgetId}" in this layout.`);
  }
  if (!isWellFormedRect(candidateRect)) {
    return layoutFailure(
      "invalid-rect",
      `The requested rectangle for "${widgetId}" is not a whole, positive block of cells.`,
    );
  }
  if (!fitsWithinColumns(candidateRect, columnCount)) {
    return layoutFailure(
      "exceeds-columns",
      `The requested rectangle for "${widgetId}" extends past column ${columnCount}.`,
    );
  }

  const anchored: PlacedWidget = {
    widgetId,
    x: candidateRect.x,
    y: candidateRect.y,
    w: candidateRect.w,
    h: candidateRect.h,
  };

  const others = layout
    .map((widget, index) => ({ widget, index }))
    .filter((entry) => entry.widget.widgetId !== widgetId);

  // A duplicate id would make "the widget being placed" ambiguous and could
  // hide an overlap behind a single lookup. Refuse rather than guess.
  const ids = new Set<string>([widgetId]);
  for (const { widget } of others) {
    if (ids.has(widget.widgetId)) {
      return layoutFailure(
        "duplicate-id",
        `Widget "${widget.widgetId}" appears more than once in this layout.`,
      );
    }
    ids.add(widget.widgetId);
  }

  // The candidate is settled first and never moves again — everything else
  // resolves around it. Sorting a COPY; the caller's array is untouched.
  const settled: PlacedWidget[] = [anchored];
  const resolved = new Map<string, PlacedWidget>([[widgetId, anchored]]);

  for (const { widget } of [...others].sort(compareForDisplacement)) {
    let y = widget.y;
    // Each pass clears every rectangle currently in the way by dropping to just
    // below the lowest of them; a pass can only reveal collisions FURTHER down,
    // and each settled rectangle can be passed at most once, so the loop is
    // bounded by the number of settled widgets. The guard turns any future
    // violation of that reasoning into a typed failure rather than a hang.
    for (let pass = 0; ; pass += 1) {
      const blockers = settled.filter((s) => rectsOverlap({ ...widget, y }, s));
      if (blockers.length === 0) break;
      const nextY = Math.max(...blockers.map(bottomOf));
      if (nextY <= y || pass > settled.length) {
        return layoutFailure(
          "collision-unresolved",
          `Could not find a stable position for "${widget.widgetId}".`,
        );
      }
      y = nextY;
    }
    // Identity is preserved when nothing moved, so callers can compare by
    // reference to see exactly which widgets the placement disturbed.
    const placed = y === widget.y ? widget : { ...widget, y };
    settled.push(placed);
    resolved.set(widget.widgetId, placed);
  }

  // Input array order is preserved: position lives in x/y, so re-ordering the
  // array would churn React keys for no reason.
  const next = layout.map((widget) => resolved.get(widget.widgetId) as PlacedWidget);

  const validation = validateLayout(next, columnCount);
  if (!validation.ok) {
    // Defensive: the algorithm above cannot produce this. If it ever does, the
    // caller gets a refusal instead of a corrupt board.
    return layoutFailure(
      "collision-unresolved",
      `Placing "${widgetId}" produced an invalid layout: ${validation.problems
        .map((p) => p.code)
        .join(", ")}.`,
    );
  }
  return { ok: true, layout: next };
}
