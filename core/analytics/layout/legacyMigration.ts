import { findFirstAvailableRect } from "./findFirstAvailableRect";
import { validateLayout } from "./validateLayout";
import { footprintForSize } from "./widgetSizeMap";
import {
  layoutFailure,
  type AnalyticsLayout,
  type LayoutResult,
  type PlacedWidget,
} from "./types";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";

/**
 * Legacy → canonical migration (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * NOT WIRED IN. This is the pure conversion a later stage will call from the
 * service layer's single read chokepoint. Nothing here touches the schema, the
 * database, or any stored row.
 *
 * THE PROBLEM IT SOLVES. The old model stored only `(array order, size preset)`
 * and let CSS `grid-auto-flow: row` derive positions at render time. Those
 * derived positions were viewport-dependent: the shipped default board packed
 * cleanly at four columns but left seven permanently empty cells at three.
 * There is therefore no authoritative position data to preserve — only an
 * order and a footprint.
 *
 * THE OWNER DECISION IT IMPLEMENTS. Migrate every board to ONE canonical
 * four-column layout, identically on every device. The empty cells the old
 * renderer produced were side effects of sparse auto-flow, never authored
 * placement, so they are NOT reproduced: each widget takes the first rectangle
 * its footprint fits into, scanning top-to-bottom and left-to-right. Where
 * sparse flow would skip a column because the next widget was too wide and then
 * never come back, first-fit reuses that opening.
 *
 * (This supersedes the audit's §15 proposal to replay CSS §8.5 exactly. The
 * boards where the two differ are precisely the boards with accidental holes,
 * and the owner ruled those holes are not user intent. The shipped default
 * board is unaffected — both algorithms produce the same five rows.)
 *
 * GUARANTEES. Deterministic; idempotent at the pure-function level; identical
 * on every device because it takes no viewport, no DOM, no CSS and no clock as
 * input; preserves the legacy array order, which is the only positional signal
 * the old model carried; preserves each widget's canonical footprint; produces
 * no overlaps.
 */

/** The only two fields of a legacy widget that carry layout meaning. */
export interface LegacyOrderedWidget {
  readonly id: string;
  readonly size: AnalyticsWidgetSize;
}

export function migrateLegacyOrderedLayout(
  widgets: readonly LegacyOrderedWidget[],
  options: { readonly columnCount: number },
): LayoutResult {
  const { columnCount } = options;
  const placed: PlacedWidget[] = [];
  const seen = new Set<string>();

  // Legacy array order IS the input order. Each widget is placed against the
  // widgets already placed, so earlier widgets keep priority — the same
  // precedence the old renderer gave them.
  for (const widget of widgets) {
    if (seen.has(widget.id)) {
      return layoutFailure(
        "duplicate-id",
        `Widget "${widget.id}" appears more than once in the stored board.`,
      );
    }
    seen.add(widget.id);

    const footprint = footprintForSize(widget.size);
    const rect = findFirstAvailableRect(placed, footprint, columnCount);
    if (!rect) {
      // Unreachable at the canonical four columns — the widest shipped preset
      // is exactly four wide. Typed so a narrower canonical width, or a new
      // preset, fails loudly instead of dropping a widget.
      return layoutFailure(
        "exceeds-columns",
        `Widget "${widget.id}" (${footprint.w}×${footprint.h}) cannot fit in ${columnCount} columns.`,
      );
    }
    placed.push({ widgetId: widget.id, ...rect });
  }

  const validation = validateLayout(placed, columnCount);
  if (!validation.ok) {
    return layoutFailure(
      "collision-unresolved",
      `Migration produced an invalid layout: ${validation.problems.map((p) => p.code).join(", ")}.`,
    );
  }
  return { ok: true, layout: placed as AnalyticsLayout };
}
