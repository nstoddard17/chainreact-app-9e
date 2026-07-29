import { placeWidget } from "./placeWidget";
import {
  layoutFailure,
  type AnalyticsLayout,
  type GridRect,
  type LayoutResult,
  type PlacementOptions,
} from "./types";

/**
 * Resize (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * Resize is a PLACEMENT, not a second algorithm. The audit found the shipped
 * system maintaining two incompatible layout paths — drag permuted an array
 * while resize edited one field and let CSS repack — which is why a resize
 * could silently rearrange a board in a way no drag ever would. There is now
 * exactly one collision engine, and this module is a thin, deliberate
 * delegation to it. Do not grow a resize-specific policy here.
 *
 * Consequences that follow from `placeWidget`'s policy, spelled out because
 * they are the ones a resize UI will ask about:
 *
 * - Growing into occupied cells pushes those widgets DOWN. Nothing moves aside.
 * - Shrinking frees cells and LEAVES THEM EMPTY. The gap is real and survives
 *   the save; it is not quietly closed up.
 * - Growing past the right edge is REFUSED (`exceeds-columns`) rather than
 *   nudged leftward to fit. Silently relocating a widget the user only asked to
 *   widen is exactly the preview-does-not-match-commit behaviour being removed.
 *   A caller that wants to-fit behaviour must ask for a rectangle that fits.
 */
export function resizeWidget(
  layout: AnalyticsLayout,
  widgetId: string,
  nextRect: GridRect,
  options: PlacementOptions,
): LayoutResult {
  return placeWidget(layout, widgetId, nextRect, options);
}

/**
 * The size-preset form: keep the widget where it is, change only its footprint.
 * This is what a preset dropdown ("1×1", "2×1", …) actually asks for, and it
 * keeps callers from having to re-derive the widget's current origin — a place
 * where the old code drifted.
 */
export function resizeWidgetToFootprint(
  layout: AnalyticsLayout,
  widgetId: string,
  footprint: { readonly w: number; readonly h: number },
  options: PlacementOptions,
): LayoutResult {
  const current = layout.find((widget) => widget.widgetId === widgetId);
  if (!current) {
    return layoutFailure("unknown-widget", `No widget "${widgetId}" in this layout.`);
  }
  return placeWidget(
    layout,
    widgetId,
    { x: current.x, y: current.y, w: footprint.w, h: footprint.h },
    options,
  );
}
