import { fitsWithinColumns, isWellFormedRect, rectsOverlap } from "./geometry";
import type { AnalyticsLayout, LayoutProblem, LayoutValidation } from "./types";

/**
 * The board-level invariant check (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * Zod validates one widget at a time and cannot see the SET — two individually
 * legal rectangles can still sit on top of each other. This is where "no two
 * committed rectangles overlap" and "every id appears once" are enforced, and
 * it is the post-condition every engine operation asserts before returning
 * `ok: true`. A caller therefore never has to re-check what the engine returns.
 *
 * Reports EVERY problem it finds rather than the first, so a repair path can
 * show a complete picture, and never throws.
 */
export function validateLayout(
  layout: AnalyticsLayout,
  columnCount: number,
): LayoutValidation {
  const problems: LayoutProblem[] = [];
  const seen = new Set<string>();

  for (const widget of layout) {
    if (seen.has(widget.widgetId)) {
      problems.push({
        code: "duplicate-id",
        widgetIds: [widget.widgetId],
        message: `Widget "${widget.widgetId}" appears more than once in the layout.`,
      });
    }
    seen.add(widget.widgetId);

    if (
      !Number.isInteger(widget.x) ||
      !Number.isInteger(widget.y) ||
      !Number.isInteger(widget.w) ||
      !Number.isInteger(widget.h)
    ) {
      problems.push({
        code: "non-integer",
        widgetIds: [widget.widgetId],
        message: `Widget "${widget.widgetId}" has a non-integer rectangle.`,
      });
      // A fractional rectangle makes every downstream check meaningless.
      continue;
    }
    if (widget.x < 0 || widget.y < 0) {
      problems.push({
        code: "negative-coordinate",
        widgetIds: [widget.widgetId],
        message: `Widget "${widget.widgetId}" is placed at a negative coordinate.`,
      });
    }
    if (widget.w < 1 || widget.h < 1) {
      problems.push({
        code: "invalid-size",
        widgetIds: [widget.widgetId],
        message: `Widget "${widget.widgetId}" must span at least one cell in each direction.`,
      });
    }
    if (isWellFormedRect(widget) && !fitsWithinColumns(widget, columnCount)) {
      problems.push({
        code: "exceeds-columns",
        widgetIds: [widget.widgetId],
        message: `Widget "${widget.widgetId}" extends past column ${columnCount}.`,
      });
    }
  }

  // Pairwise, because a board is capped well below the size where this matters.
  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      const a = layout[i]!;
      const b = layout[j]!;
      if (!isWellFormedRect(a) || !isWellFormedRect(b)) continue;
      if (rectsOverlap(a, b)) {
        problems.push({
          code: "overlap",
          widgetIds: [a.widgetId, b.widgetId],
          message: `Widgets "${a.widgetId}" and "${b.widgetId}" occupy the same cells.`,
        });
      }
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
