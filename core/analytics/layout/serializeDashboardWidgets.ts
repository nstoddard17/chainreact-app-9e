import { footprintForSize, type AnalyticsWidget } from "@/contracts/analytics";
import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";
import { validateLayout } from "./validateLayout";
import type { AnalyticsLayout, PlacedWidget } from "./types";

/**
 * The write boundary (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1).
 *
 * A dashboard save must never convert a board's storage model as a side effect.
 * Renaming a widget, editing a data source, or reordering under the old model
 * are not decisions to start persisting explicit placement — and crossing that
 * line is a ONE-WAY DOOR while a rollback to a parser without `layout` is still
 * possible. So intent is explicit and must be asked for:
 *
 *   `preserve-source`          — emit the widgets exactly as they are. A legacy
 *                                board stays legacy; an explicit board keeps its
 *                                exact rectangles, uncompacted and unreordered.
 *   `persist-explicit-layout`  — write placement for EVERY widget, from a
 *                                supplied canonical layout.
 *
 * Having an effective layout in memory is NOT intent. Every read produces one;
 * none of them are a reason to write. No production code path asks for
 * `persist-explicit-layout` yet — the drag and resize stages introduce it,
 * after a compatibility release that can read the field is verified live.
 */

export type LayoutPersistenceIntent = "preserve-source" | "persist-explicit-layout";

export type SerializeFailureReason =
  /** A widget has no rectangle in the supplied layout. */
  | "missing-placement"
  /** The supplied layout places a widget that is no longer on the board. */
  | "stale-placement"
  /** A rectangle contradicts the widget's `size` preset. */
  | "size-layout-mismatch"
  /** The resulting board overlaps, repeats an id, or leaves the grid. */
  | "invalid-layout";

export type SerializeResult =
  | { readonly ok: true; readonly widgets: readonly AnalyticsWidget[] }
  | { readonly ok: false; readonly reason: SerializeFailureReason; readonly message: string };

export function serializeDashboardWidgets(
  widgets: readonly AnalyticsWidget[],
  intent: LayoutPersistenceIntent,
  options: { readonly layout?: AnalyticsLayout; readonly columnCount?: number } = {},
): SerializeResult {
  if (intent === "preserve-source") {
    // Deliberately identity-preserving: whatever shape came in goes out. This
    // is what keeps a title-only save from rewriting a legacy board.
    return { ok: true, widgets };
  }

  const columnCount = options.columnCount ?? ANALYTICS_CANONICAL_COLUMNS;
  const layout = options.layout ?? [];
  const byId = new Map<string, PlacedWidget>(layout.map((p) => [p.widgetId, p]));

  const ids = new Set(widgets.map((w) => w.id));
  const stale = layout.filter((p) => !ids.has(p.widgetId));
  if (stale.length > 0) {
    return {
      ok: false,
      reason: "stale-placement",
      message: `The layout places widgets that are not on the board: ${stale
        .map((p) => p.widgetId)
        .join(", ")}.`,
    };
  }

  const next: AnalyticsWidget[] = [];
  for (const widget of widgets) {
    const placement = byId.get(widget.id);
    if (!placement) {
      // Half-placed boards are exactly the invalid transitional state the read
      // path has to repair. Refuse to create one.
      return {
        ok: false,
        reason: "missing-placement",
        message: `Widget "${widget.id}" has no placement, so explicit layout cannot be persisted.`,
      };
    }
    const expected = footprintForSize(widget.size);
    if (placement.w !== expected.w || placement.h !== expected.h) {
      return {
        ok: false,
        reason: "size-layout-mismatch",
        message:
          `Widget "${widget.id}" is placed ${placement.w}×${placement.h} but its "${widget.size}" ` +
          `preset is ${expected.w}×${expected.h}.`,
      };
    }
    next.push({
      ...widget,
      layout: { x: placement.x, y: placement.y, w: placement.w, h: placement.h },
    });
  }

  const validation = validateLayout(
    next.map((w) => ({ widgetId: w.id, ...w.layout! })),
    columnCount,
  );
  if (!validation.ok) {
    // A typed refusal, never a silent repair: quietly "fixing" a board the user
    // just arranged is the preview-does-not-match-commit failure again.
    return {
      ok: false,
      reason: "invalid-layout",
      message: `The board is not valid: ${validation.problems.map((p) => p.code).join(", ")}.`,
    };
  }
  return { ok: true, widgets: next };
}
