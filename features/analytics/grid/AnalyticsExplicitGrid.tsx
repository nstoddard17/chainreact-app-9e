"use client";

import type { ReactNode } from "react";
import type { AnalyticsWidget } from "@/contracts/analytics";
import type { AnalyticsLayout, GridRect, PlacedWidget } from "@/core/analytics/layout";
import { ErrorBanner } from "../dashboardHelpers";
import { buildAnalyticsGridItems } from "./buildAnalyticsGridItems";
import { gridContainerStyle, gridPlacementStyle } from "./gridGeometry";
import type { AnalyticsColumnCount } from "@/core/analytics/layout";

/**
 * The explicit Analytics grid (ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1).
 *
 * Renders a board from real rectangles: every card is placed by grid LINE, so
 * what is on screen is exactly `x/y/w/h` and nothing else gets a vote. There is
 * no auto-placement, no `dense`, and no reliance on DOM order — the three things
 * the audit found silently rewriting the arrangement in the shipping renderer.
 * A deliberately empty cell therefore stays empty.
 *
 * NOT WIRED IN. The shipping Analytics page still uses the ordered auto-flow
 * grid. Rendering and dragging have to change together — a page that renders
 * explicit rectangles while the drag session still permutes an array would be
 * edit mode in a half-converted state — so S4 switches both at once. Until then
 * this component is reached only by its tests.
 *
 * IT RECEIVES A LAYOUT; IT NEVER DERIVES ONE. No migration, no repair, no
 * collision resolution, no compaction, no state updates, no persistence, no
 * knowledge of routes or repositories. Normalization happened at the read
 * chokepoint long before this component sees anything.
 */

/**
 * The destination footprint S4's drag session will drive. It is presentation
 * ONLY: it takes no part in placement, is not a drop target, and cannot displace
 * a widget — it simply occupies the cells the drop would claim.
 */
export interface AnalyticsGridPlaceholder extends GridRect {
  /** The widget being moved, when there is one. Used for the test id. */
  readonly widgetId?: string;
  /** Short footprint label, e.g. "2×1". */
  readonly label?: string;
}

export interface AnalyticsExplicitGridProps {
  readonly widgets: readonly AnalyticsWidget[];
  /** A complete, already-normalized effective layout — one rect per widget. */
  readonly layout: AnalyticsLayout;
  readonly renderWidget: (widget: AnalyticsWidget, placement: PlacedWidget) => ReactNode;
  readonly placeholder?: AnalyticsGridPlaceholder | null;
  readonly className?: string;
  /** Overridden only by tests that exercise a non-canonical grid width. */
  readonly columnCount?: number;
  /**
   * The RENDERED projection of `layout`, when the grid is narrower than the
   * canonical four columns. Absent ⇒ canonical rendering.
   */
  readonly renderLayout?: AnalyticsLayout;
  /** How many columns to draw. Defaults to the canonical four. */
  readonly renderColumnCount?: AnalyticsColumnCount;
}

export function AnalyticsExplicitGrid({
  widgets,
  layout,
  renderWidget,
  placeholder = null,
  className,
  columnCount,
  renderLayout,
  renderColumnCount,
}: AnalyticsExplicitGridProps) {
  const built = buildAnalyticsGridItems(widgets, layout, {
    ...(columnCount === undefined ? {} : { columnCount }),
    ...(renderLayout === undefined ? {} : { renderLayout }),
    ...(renderColumnCount === undefined ? {} : { renderColumnCount }),
  });

  if (!built.ok) {
    // A board that does not pair up is not partly drawn: half a dashboard,
    // silently missing the widgets that failed, is worse than an honest empty
    // state because it looks correct. The message names no stored content.
    return (
      <div data-testid="analytics-explicit-grid-error">
        <ErrorBanner message="This dashboard's layout can't be displayed right now." />
      </div>
    );
  }

  return (
    <div
      data-testid="analytics-explicit-grid"
      // `relative` is load-bearing for S4, not cosmetic: it makes this element
      // the offsetParent of the cells, so their offsetLeft/offsetTop are
      // grid-local and can be compared with grid-local pointer coordinates.
      // The drag overlay stays OUTSIDE this element and position: fixed — no
      // transform is applied here, so the overlay's viewport space is intact.
      className={"relative" + (className ? ` ${className}` : "")}
      style={gridContainerStyle(renderColumnCount)}
    >
      {built.items.map(({ widget, canonicalPlacement, renderPlacement }) => (
        <div
          key={widget.id}
          data-testid={`analytics-grid-cell-${widget.id}`}
          data-widget-id={widget.id}
          data-grid-x={renderPlacement.x}
          data-grid-y={renderPlacement.y}
          data-grid-w={renderPlacement.w}
          data-grid-h={renderPlacement.h}
          data-canonical-x={canonicalPlacement.x}
          data-canonical-y={canonicalPlacement.y}
          data-canonical-w={canonicalPlacement.w}
          data-canonical-h={canonicalPlacement.h}
          // A fixed row track only holds if the cell refuses to grow: `min-h-0`
          // defeats the flex/grid default minimum, `overflow-hidden` bounds the
          // content. Without both, one tall card silently redefines the row
          // height and every cell coordinate below it moves.
          className="min-h-0 min-w-0 overflow-hidden"
          style={gridPlacementStyle(renderPlacement)}
        >
          {renderWidget(widget, canonicalPlacement)}
        </div>
      ))}
      {placeholder && (
        <div
          data-testid={
            placeholder.widgetId
              ? `analytics-grid-placeholder-${placeholder.widgetId}`
              : "analytics-grid-placeholder"
          }
          data-grid-x={placeholder.x}
          data-grid-y={placeholder.y}
          data-grid-w={placeholder.w}
          data-grid-h={placeholder.h}
          aria-hidden="true"
          className="pointer-events-none flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10"
          style={gridPlacementStyle(placeholder)}
        >
          {placeholder.label && (
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[11px] font-semibold text-primary-foreground">
              {placeholder.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
