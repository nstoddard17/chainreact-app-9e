"use client";

/**
 * Analytics chart primitives — pure SVG on the V2 dark-dashboard HSL tokens
 * (`hsl(var(--primary))`, `--success`, `--destructive`, `--border`,
 * `--foreground`, `--muted-foreground`). No external chart dependency.
 *
 * All inputs are real, account-scoped aggregates from `AnalyticsOverview`.
 *
 * THIS FILE IS THE ENTRY POINT. Every consumer imports from here; the families
 * below are split only for the 400-line module budget.
 *
 * RESPONSIVE (ANALYTICS-RESPONSIVE-CHART-SURFACES-1). Every chart derives its
 * geometry from the widget body it was given, measured once by the shared
 * `ResponsiveChartSurface`. What each chart used to do instead, and why it was
 * visibly wrong:
 *
 *   - `LineChart` drew into a fixed `0 0 600 220` viewBox at `width="100%"` with
 *     `preserveAspectRatio="none"` and NO height attribute, so the browser gave
 *     the SVG its aspect-ratio height — at a four-column widget that is ~500px
 *     of SVG inside a ~117px body, and the card's `overflow-hidden` cut the
 *     bottom (and any tall spike) off. It now paints into real pixels.
 *   - `Sparkline` defaulted to 140×42 and was called at 150×42, so it stayed a
 *     stamp in the corner of a card that had ten times the width.
 *   - `Heatmap` used a fixed 14px cell, which is why "When your automations run"
 *     was tiny inside a large widget.
 *   - `DonutChart` used a fixed r=70 in a fixed 150px box with a permanent side
 *     legend, so it neither grew nor got out of its own way when narrow.
 *   - `BarChart` had no height awareness at all, so six rows at a fixed row
 *     height simply overflowed a short widget.
 *
 * THE SHAPE OF EVERY CHART. A container that owns `h-full min-h-0 min-w-0
 * flex-col`, a `flex-1` surface that measures itself, and any legend/footer as a
 * `shrink-0` sibling — never a sibling the plot has to guess the size of. The
 * `*Plot` components take explicit `width`/`height` and are exported so the unit
 * suite can assert geometry without a browser.
 *
 * NOTHING HERE PERSISTS ANYTHING. No measured dimension is ever written to
 * widget config, dashboard JSON, or a request body.
 */

export {
  CHART_COLORS,
  ChartSurfaceFrame,
  MetricNumber,
  formatDuration,
  formatNumber,
} from "./chartPrimitives";
export { LineChart, LinePlot, Sparkline, SparklinePlot, type LineSeries } from "./chartTimeSeries";
export { BarChart, BarRows, type BarRow } from "./chartRanking";
export {
  DonutChart,
  DonutPlot,
  Heatmap,
  HeatmapPlot,
  type DonutSegment,
} from "./chartShare";
