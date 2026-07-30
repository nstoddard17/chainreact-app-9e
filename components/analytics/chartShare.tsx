"use client";

/**
 * Part of the Analytics chart primitives, split by family for the 400-line
 * module budget (ANALYTICS-RESPONSIVE-CHART-SURFACES-1). Import from
 * `@/components/analytics/charts`, which re-exports every chart in one place —
 * these modules are the implementation, not the entry point.
 *
 * The rule every chart here follows: it is TOLD its width and height by the
 * shared `ResponsiveChartSurface` and derives all geometry from them. Nothing
 * assumes a column count, a browser width, a widget preset or a 190px row, and
 * no measured dimension is ever persisted.
 */

import { CHART_COLORS, ChartSurfaceFrame } from "./chartPrimitives";
import {
  ANALYTICS_HEATMAP_CELL_GAP,
  donutCenterTypography,
  donutLayout,
  donutRadii,
  heatmapCellSize,
  heatmapExtent,
} from "@/core/analytics/chartSizing";

// ── DonutChart — segments + center label ─────────────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** The ring itself, sized to the inscribed square of the box it is given. */
export function DonutPlot({
  segments,
  center,
  sublabel,
  diameter,
  ariaLabel,
}: {
  segments: readonly DonutSegment[];
  center: string;
  sublabel: string;
  diameter: number;
  ariaLabel: string;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const { outerRadius, innerRadius, strokeWidth } = donutRadii({
    width: diameter,
    height: diameter,
  });
  if (outerRadius <= 0) return null;

  const circumference = Math.PI * 2 * outerRadius;
  const mid = diameter / 2;
  const type = donutCenterTypography(innerRadius, center.length);
  let offset = 0;

  return (
    <svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      data-testid="analytics-donut"
      role="img"
      aria-label={ariaLabel}
    >
      <circle
        cx={mid}
        cy={mid}
        r={outerRadius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
      />
      {segments.map((s, i) => {
        const len = (s.value / total) * circumference;
        const el = (
          <circle
            key={i}
            cx={mid}
            cy={mid}
            r={outerRadius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${len} ${circumference}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${mid} ${mid})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
      <text
        x={mid}
        y={mid + (type.showLabel ? 0 : type.valueFontSize * 0.35)}
        textAnchor="middle"
        fontSize={type.valueFontSize}
        fontWeight="700"
        fill={CHART_COLORS.text}
      >
        {center}
      </text>
      {type.showLabel && (
        <text
          x={mid}
          y={mid + type.valueFontSize * 0.85}
          textAnchor="middle"
          fontSize={type.labelFontSize}
          fill={CHART_COLORS.muted}
        >
          {sublabel}
        </text>
      )}
    </svg>
  );
}

function DonutLegend({ segments, total }: { segments: readonly DonutSegment[]; total: number }) {
  return (
    <ul className="flex min-w-0 flex-col gap-1" aria-label="Outcome breakdown">
      {segments.map((s, i) => (
        <li key={i} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11.5px]">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          <span className="truncate text-foreground/80" title={s.label}>
            {s.label}
          </span>
          <span className="whitespace-nowrap font-mono font-semibold text-foreground">
            {Math.round((s.value / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * `By outcome`. The legend sits beside the ring when there is genuinely room
 * for both and beneath it when there is not — the old chart kept it beside at
 * every size, which is what squeezed the donut in a narrow widget.
 *
 * Every value stays readable as text in the legend, and the centre percentage is
 * text in the SVG, so nothing here is conveyed by colour or size alone.
 */
export function DonutChart({
  segments,
  center,
  sublabel,
  ariaLabel = "Outcome breakdown",
}: {
  segments: readonly DonutSegment[];
  center: string;
  sublabel: string;
  ariaLabel?: string;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChartSurfaceFrame testId="analytics-donut-surface" fallbackWidth={420} fallbackHeight={170}>
        {({ width, height }) => {
          const layout = donutLayout({ width, height, sliceCount: segments.length });
          if (layout.diameter <= 0) return null;
          return layout.orientation === "side" ? (
            <div
              className="flex h-full min-h-0 min-w-0 items-center gap-2.5"
              data-testid="analytics-donut-layout"
              data-donut-orientation="side"
            >
              <div className="flex shrink-0 items-center justify-center">
                <DonutPlot
                  segments={segments}
                  center={center}
                  sublabel={sublabel}
                  diameter={layout.diameter}
                  ariaLabel={ariaLabel}
                />
              </div>
              <div className="min-w-0 flex-1">
                <DonutLegend segments={segments} total={total} />
              </div>
            </div>
          ) : (
            <div
              className="flex h-full min-h-0 min-w-0 flex-col items-center gap-2"
              data-testid="analytics-donut-layout"
              data-donut-orientation="stacked"
            >
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <DonutPlot
                  segments={segments}
                  center={center}
                  sublabel={sublabel}
                  diameter={layout.diameter}
                  ariaLabel={ariaLabel}
                />
              </div>
              <div className="w-full shrink-0">
                <DonutLegend segments={segments} total={total} />
              </div>
            </div>
          );
        }}
      </ChartSurfaceFrame>
    </div>
  );
}

// ── Heatmap — weeks × 7-day calendar grid ────────────────────────────────────

const HEATMAP_ROWS = 7;

/**
 * The matrix at an explicit size. Cells are the largest SQUARE that fits both
 * axes, so the heatmap grows with its widget without being stretched into
 * rectangles to fill it.
 *
 * ALIGNMENT, decided deliberately: the matrix is centred in both axes. A
 * calendar grid has a fixed aspect ratio, so one axis almost always has slack;
 * centring reads as "this is the whole chart", where the old top-left anchoring
 * read as "something failed to fill the card".
 */
export function HeatmapPlot({
  cells,
  maxCell,
  width,
  height,
  ariaLabel = "Activity heatmap",
}: {
  cells: readonly number[];
  maxCell: number;
  width: number;
  height: number;
  ariaLabel?: string;
}) {
  const columnCount = Math.max(1, Math.ceil(cells.length / HEATMAP_ROWS));
  const gap = ANALYTICS_HEATMAP_CELL_GAP;
  const cell = heatmapCellSize({
    availableWidth: width,
    availableHeight: height,
    columnCount,
    rowCount: HEATMAP_ROWS,
    gap,
  });
  if (cell <= 0 || cells.length === 0) return null;

  const W = heatmapExtent(columnCount, cell, gap);
  const H = heatmapExtent(HEATMAP_ROWS, cell, gap);
  const denom = Math.max(1, maxCell);
  const radius = Math.max(1, Math.round(cell * 0.2));

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        data-testid="analytics-heatmap"
        data-heatmap-cell={cell}
        role="img"
        aria-label={ariaLabel}
      >
        {cells.map((v, i) => {
          const w = Math.floor(i / HEATMAP_ROWS);
          const d = i % HEATMAP_ROWS;
          const opacity = v === 0 ? 0.07 : 0.25 + (v / denom) * 0.75;
          return (
            <rect
              key={i}
              x={w * (cell + gap)}
              y={d * (cell + gap)}
              width={cell}
              height={cell}
              rx={radius}
              fill={CHART_COLORS.primary}
              fillOpacity={opacity}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** `When your automations run` — the matrix plus its Less→More legend. */
export function Heatmap({
  cells,
  maxCell,
  ariaLabel = "Activity heatmap",
}: {
  cells: readonly number[];
  maxCell: number;
  ariaLabel?: string;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChartSurfaceFrame
        testId="analytics-heatmap-surface"
        fallbackWidth={420}
        fallbackHeight={140}
      >
        {({ width, height }) => (
          <HeatmapPlot
            cells={cells}
            maxCell={maxCell}
            width={width}
            height={height}
            ariaLabel={ariaLabel}
          />
        )}
      </ChartSurfaceFrame>
      <div className="flex shrink-0 items-center gap-1 pt-1.5 text-[10.5px] text-muted-foreground">
        <span>Less</span>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((o, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: CHART_COLORS.primary, opacity: o }}
            aria-hidden
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

