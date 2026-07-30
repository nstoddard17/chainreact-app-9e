/**
 * Responsive chart geometry (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * PURE ARITHMETIC ONLY. Every Analytics visualization now derives its geometry
 * from the box it was actually given, and the arithmetic that does the deriving
 * lives here so it can be reasoned about and tested without a DOM. Nothing in
 * this file reads the window, touches React, or knows a widget exists.
 *
 * WHY IT EXISTS. The chart primitives used to carry fixed desktop dimensions —
 * a 600×220 line viewBox, a 140px sparkline, a 14px heatmap cell, a 70px donut
 * radius. Those numbers were right for exactly one widget footprint, so once the
 * explicit layout let a widget be 1×1 or 4×2 the charts were either clipped by
 * the card or marooned in a corner of it. The fix is that a chart is told its
 * width and height and computes everything from them.
 *
 * WHAT IS SHARED AND WHAT IS NOT. Only decisions more than one chart needs are
 * here: the compact/short thresholds, the plot margins, the heatmap cell
 * formula, the donut orientation rule. A chart's private visual choices (stroke
 * widths, colours, label wording) stay in the chart. This is deliberately not a
 * config file for every chart.
 */

/** Below this body width a chart switches to its compact presentation. */
export const ANALYTICS_CHART_COMPACT_WIDTH = 320;

/** Below this body height a chart is "short" — a 1×1 footprint, in practice. */
export const ANALYTICS_CHART_SHORT_HEIGHT = 130;

/**
 * The smallest box worth drawing into. Under this a chart renders nothing rather
 * than a scribble: a 20px-wide line chart is noise, not information, and axis
 * arithmetic on a box that small produces negative inner dimensions.
 */
export const ANALYTICS_CHART_MIN_WIDTH = 48;
export const ANALYTICS_CHART_MIN_HEIGHT = 32;

/** Gap between heatmap cells, in CSS pixels. */
export const ANALYTICS_HEATMAP_CELL_GAP = 3;

/**
 * Heatmap cell bounds. The maximum exists for readability, not to cap growth —
 * it is set well above the old fixed 14px so a large widget genuinely grows.
 */
export const ANALYTICS_HEATMAP_MIN_CELL_PX = 4;
export const ANALYTICS_HEATMAP_MAX_CELL_PX = 30;

/** A side legend is only worth having when it has this much room. */
export const ANALYTICS_DONUT_MIN_LEGEND_WIDTH = 128;

/** …and only when the donut left over is still big enough to read. */
export const ANALYTICS_DONUT_MIN_SIDE_DIAMETER = 92;

/** Vertical room one bar row needs at its most and least generous. */
export const ANALYTICS_BAR_ROW_MAX_HEIGHT = 34;
export const ANALYTICS_BAR_ROW_MIN_HEIGHT = 18;

export interface ChartMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ChartSize {
  readonly width: number;
  readonly height: number;
}

/** True when the body is too narrow for the full axis treatment. */
export function isCompactChartWidth(width: number): boolean {
  return width < ANALYTICS_CHART_COMPACT_WIDTH;
}

/** True when the body is too short for the full axis treatment. */
export function isShortChartHeight(height: number): boolean {
  return height < ANALYTICS_CHART_SHORT_HEIGHT;
}

/** A box big enough that drawing into it is meaningful. */
export function isDrawableChartSize({ width, height }: ChartSize): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= ANALYTICS_CHART_MIN_WIDTH &&
    height >= ANALYTICS_CHART_MIN_HEIGHT
  );
}

/**
 * Plot margins for an axed chart.
 *
 * The margins are the whole reason the old line chart clipped: it reserved a
 * fixed 38/14/14/24 out of a viewBox that was then stretched to an arbitrary
 * height with `preserveAspectRatio="none"`, so at a real height of 117px the
 * reserved bands and the drawable area no longer added up to the box. Here they
 * are pixels of the real box, and `innerPlot` below proves they still fit.
 */
export function lineChartMargins(width: number, height: number): ChartMargins {
  const compact = isCompactChartWidth(width);
  const short = isShortChartHeight(height);
  return {
    top: short ? 6 : 10,
    right: compact ? 8 : 14,
    bottom: short ? 14 : 20,
    left: compact ? 24 : 36,
  };
}

/**
 * The drawable rectangle inside the margins, never negative. A chart that asks
 * for an inner box it cannot have gets zeros and declines to draw, rather than
 * emitting a path with non-finite coordinates.
 */
export function innerPlot(
  size: ChartSize,
  margins: ChartMargins,
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(0, size.width - margins.left - margins.right),
    height: Math.max(0, size.height - margins.top - margins.bottom),
  };
}

/**
 * Horizontal gridlines / value ticks. A short body cannot carry four labelled
 * bands without them colliding, so it gets fewer — the data line is what must
 * survive, not the tick count.
 */
export function lineChartTickCount(height: number): number {
  if (height < 90) return 2;
  if (isShortChartHeight(height)) return 3;
  return 4;
}

/**
 * Show every Nth category label. Derived from how much room one label needs, so
 * a wide chart labels densely and a narrow one thins out instead of overlapping.
 */
export function lineChartLabelStep(labelCount: number, innerWidth: number): number {
  if (labelCount <= 1) return 1;
  const perLabel = isCompactChartWidth(innerWidth) ? 42 : 64;
  const slots = Math.max(2, Math.floor(innerWidth / perLabel));
  return Math.max(1, Math.ceil(labelCount / slots));
}

/**
 * Sparkline breathing room. The end dot and the stroke both extend past the
 * path, so without an inset the first and last points get clipped by the SVG
 * edge — which is exactly what a "restrained" sparkline must not do.
 */
export function sparklineInset(height: number): {
  readonly side: number;
  readonly vertical: number;
} {
  return { side: 3, vertical: height < 28 ? 3 : 5 };
}

/**
 * The largest SQUARE cell that fits the matrix in both axes.
 *
 * Square is non-negotiable: a calendar heatmap whose cells are stretched into
 * rectangles to fill the card reads as a different chart. So the matrix takes
 * the smaller of the two per-axis budgets and the leftover space stays leftover
 * (the caller centres it — see `HeatmapPlot`).
 */
export function heatmapCellSize({
  availableWidth,
  availableHeight,
  columnCount,
  rowCount,
  gap = ANALYTICS_HEATMAP_CELL_GAP,
  minCell = ANALYTICS_HEATMAP_MIN_CELL_PX,
  maxCell = ANALYTICS_HEATMAP_MAX_CELL_PX,
}: {
  availableWidth: number;
  availableHeight: number;
  columnCount: number;
  rowCount: number;
  gap?: number;
  minCell?: number;
  maxCell?: number;
}): number {
  if (columnCount <= 0 || rowCount <= 0) return 0;
  if (!Number.isFinite(availableWidth) || !Number.isFinite(availableHeight)) return 0;
  const widthBudget = (availableWidth - gap * (columnCount - 1)) / columnCount;
  const heightBudget = (availableHeight - gap * (rowCount - 1)) / rowCount;
  const fitted = Math.floor(Math.min(widthBudget, heightBudget));
  if (!Number.isFinite(fitted) || fitted < minCell) return 0;
  return Math.min(maxCell, fitted);
}

/** Total extent of a `count`-long axis of `cell`-sized cells with gaps. */
export function heatmapExtent(count: number, cell: number, gap = ANALYTICS_HEATMAP_CELL_GAP): number {
  if (count <= 0 || cell <= 0) return 0;
  return count * cell + (count - 1) * gap;
}

/**
 * Donut orientation. Side-by-side reads better when there is room for both, but
 * keeping it once the donut has been squeezed under ~92px is the trade the old
 * chart made and the reason the donut looked cramped in a narrow widget.
 */
export function donutOrientation({ width, height }: ChartSize): "side" | "stacked" {
  const sideDiameter = Math.min(width - ANALYTICS_DONUT_MIN_LEGEND_WIDTH, height);
  return sideDiameter >= ANALYTICS_DONUT_MIN_SIDE_DIAMETER ? "side" : "stacked";
}

/** One legend row's height, in pixels, at the donut's own text size. */
export const ANALYTICS_DONUT_LEGEND_ROW_HEIGHT = 16;
export const ANALYTICS_DONUT_LEGEND_ROW_GAP = 4;

/**
 * The complete donut layout: where the legend goes and how big the circle is.
 *
 * DERIVED, NOT MEASURED A SECOND TIME. The legend's extent is arithmetic from
 * the slice count, so the diameter is known from the one measurement of the
 * body — no nested observer, and the browser assertions (donut inside body,
 * legend inside body) are predictable from the numbers alone.
 */
export function donutLayout({
  width,
  height,
  sliceCount,
}: {
  width: number;
  height: number;
  sliceCount: number;
}): {
  readonly orientation: "side" | "stacked";
  readonly diameter: number;
  /** Space the legend occupies on its own axis. */
  readonly legendWidthPx: number;
  readonly legendHeightPx: number;
} {
  const rows = Math.max(0, sliceCount);
  const legendHeightPx =
    rows === 0
      ? 0
      : rows * ANALYTICS_DONUT_LEGEND_ROW_HEIGHT + (rows - 1) * ANALYTICS_DONUT_LEGEND_ROW_GAP;
  const orientation = donutOrientation({ width, height });
  const GAP = 10;

  if (orientation === "side") {
    const legendWidthPx = Math.max(
      ANALYTICS_DONUT_MIN_LEGEND_WIDTH,
      Math.floor(width * 0.42),
    );
    return {
      orientation,
      diameter: Math.max(0, Math.floor(Math.min(height, width - legendWidthPx - GAP))),
      legendWidthPx,
      legendHeightPx: 0,
    };
  }
  return {
    orientation,
    diameter: Math.max(0, Math.floor(Math.min(width, height - legendHeightPx - GAP))),
    legendWidthPx: 0,
    legendHeightPx,
  };
}

/**
 * Donut radii from the box it actually got. `diameter` is the inscribed square,
 * so the circle is round and cannot be clipped on any edge; the ring thickness
 * scales with it so a small donut stays a donut rather than a filled disc.
 */
export function donutRadii({ width, height }: ChartSize): {
  readonly diameter: number;
  readonly outerRadius: number;
  readonly innerRadius: number;
  readonly strokeWidth: number;
} {
  const diameter = Math.max(0, Math.floor(Math.min(width, height)));
  const strokeWidth = Math.max(6, Math.round(diameter * 0.15));
  // The stroke straddles the radius, so the ring's outer edge sits at
  // `outerRadius + strokeWidth / 2` — which must stay inside the box. The extra
  // half-pixel keeps antialiasing off the boundary too, so "not clipped" is
  // true of the painted pixels and not merely of the geometry.
  const outerRadius = Math.max(0, (diameter - strokeWidth) / 2 - 0.5);
  return {
    diameter,
    outerRadius,
    innerRadius: Math.max(0, outerRadius - strokeWidth / 2),
    strokeWidth,
  };
}

/**
 * Font sizes for the donut's centre readout, scaled so the value never spills
 * past the inner radius (which is what a fixed 26px did in a small widget).
 */
export function donutCenterTypography(innerRadius: number, centerLength: number): {
  readonly valueFontSize: number;
  readonly labelFontSize: number;
  readonly showLabel: boolean;
} {
  // Roughly 0.6em per character for the numeric faces in use; keep the string
  // inside the inscribed square of the inner circle, not the circle itself.
  const usable = Math.max(1, innerRadius * 1.4);
  const byWidth = usable / Math.max(1, centerLength * 0.62);
  const valueFontSize = Math.max(9, Math.min(28, Math.floor(Math.min(byWidth, innerRadius * 0.9))));
  return {
    valueFontSize,
    labelFontSize: Math.max(8, Math.round(valueFontSize * 0.42)),
    showLabel: innerRadius >= 26 && valueFontSize >= 12,
  };
}

/**
 * Horizontal-bar row metrics.
 *
 * Rows shrink toward a readable floor before the count is reduced, and when the
 * body genuinely cannot hold every row the caller says so ("+N more") rather
 * than silently dropping records or slicing the last row in half.
 */
export function barChartMetrics({
  width,
  height,
  rowCount,
}: {
  width: number;
  height: number;
  rowCount: number;
}): {
  readonly visibleRows: number;
  readonly hiddenRows: number;
  readonly rowHeight: number;
  readonly rowGap: number;
  readonly barHeight: number;
  readonly labelMaxPx: number;
} {
  const rowGap = height < 150 ? 4 : 8;
  const compact = isCompactChartWidth(width);
  const labelMaxPx = Math.max(56, Math.min(compact ? 96 : 180, Math.floor(width * 0.34)));

  if (rowCount <= 0 || height <= 0) {
    return { visibleRows: 0, hiddenRows: 0, rowHeight: 0, rowGap, barHeight: 0, labelMaxPx };
  }

  const fitsAt = (rows: number) => (height - rowGap * (rows - 1)) / rows;
  let visibleRows = rowCount;
  while (visibleRows > 1 && fitsAt(visibleRows) < ANALYTICS_BAR_ROW_MIN_HEIGHT) visibleRows -= 1;

  const rowHeight = Math.max(
    ANALYTICS_BAR_ROW_MIN_HEIGHT,
    Math.min(ANALYTICS_BAR_ROW_MAX_HEIGHT, Math.floor(fitsAt(visibleRows))),
  );
  return {
    visibleRows,
    hiddenRows: rowCount - visibleRows,
    rowHeight,
    rowGap,
    barHeight: Math.max(5, Math.min(12, Math.round(rowHeight * 0.34))),
    labelMaxPx,
  };
}
