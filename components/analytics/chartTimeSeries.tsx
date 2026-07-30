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

import { useId } from "react";
import { CHART_COLORS, ChartSurfaceFrame } from "./chartPrimitives";
import {
  innerPlot,
  isCompactChartWidth,
  lineChartLabelStep,
  lineChartMargins,
  lineChartTickCount,
  sparklineInset,
} from "@/core/analytics/chartSizing";

const SERIES_COLORS = [CHART_COLORS.primary, CHART_COLORS.purple, CHART_COLORS.success];

// ── Sparkline ────────────────────────────────────────────────────────────────

/**
 * The sparkline plot at an explicit size. Insets keep the end dot and the
 * stroke inside the SVG box, so the first and last points are never half a
 * pixel outside it.
 */
export function SparklinePlot({
  data,
  width,
  height,
  color = CHART_COLORS.primary,
  ariaLabel = "Trend",
}: {
  data: readonly number[];
  width: number;
  height: number;
  color?: string;
  ariaLabel?: string;
}) {
  const inset = sparklineInset(height);
  const innerW = width - inset.side * 2;
  const innerH = height - inset.vertical * 2;
  if (data.length < 2 || innerW <= 0 || innerH <= 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const pts = data.map<[number, number]>((v, i) => [
    inset.side + (i / (data.length - 1)) * innerW,
    inset.vertical + innerH - ((v - min) / range) * innerH,
  ]);
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const last = pts[pts.length - 1]!;
  const area = `${path} L${(width - inset.side).toFixed(1)} ${height} L${inset.side} ${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="analytics-sparkline"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={area} fill={color} fillOpacity="0.12" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={Math.min(2.5, inset.side)} fill={color} />
    </svg>
  );
}

/**
 * A sparkline that fills the room it is given. Restrained by construction — it
 * has no axes, no labels and no legend — but it uses the whole width of a wide
 * card instead of the ~140px it used to be pinned to.
 */
export function Sparkline({
  data,
  color = CHART_COLORS.primary,
  ariaLabel = "Trend",
}: {
  data: readonly number[];
  color?: string;
  ariaLabel?: string;
}) {
  return (
    <ChartSurfaceFrame
      testId="analytics-sparkline-surface"
      fallbackWidth={240}
      fallbackHeight={42}
      // A sparkline has no axes or labels, so it stays readable in a band far
      // shorter than an axed chart needs — which is the whole point of it being
      // the element that absorbs a stat card's vertical squeeze.
      minimumHeight={18}
      minimumWidth={40}
    >
      {({ width, height }) => (
        <SparklinePlot
          data={data}
          width={width}
          height={height}
          color={color}
          ariaLabel={ariaLabel}
        />
      )}
    </ChartSurfaceFrame>
  );
}

// ── LineChart — multi-series with axes ───────────────────────────────────────

export interface LineSeries {
  name: string;
  data: readonly number[];
  color?: string;
}

/**
 * Shorten a preformatted category label for a narrow axis. The labels this
 * chart receives are short dates ("Jun 15"), so the trailing token is the
 * distinguishing part — dropping the rest keeps every remaining tick legible
 * instead of shrinking the type until the ticks collide.
 */
function compactTickLabel(label: string): string {
  const parts = label.trim().split(/\s+/);
  return parts[parts.length - 1] ?? label;
}

/** Axis value labels have a hard 24px band when compact, so thousands shorten. */
function axisValueLabel(value: number, compact: boolean): string {
  if (!compact || Math.abs(value) < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

/** The line plot at an explicit size. Everything is pixels of the real box. */
export function LinePlot({
  series,
  labels,
  width,
  height,
  ariaLabel,
}: {
  series: readonly LineSeries[];
  labels: readonly string[];
  width: number;
  height: number;
  ariaLabel: string;
}) {
  const gid = useId();
  const compact = isCompactChartWidth(width);
  const margins = lineChartMargins(width, height);
  const inner = innerPlot({ width, height }, margins);
  if (inner.width <= 0 || inner.height <= 0) return null;

  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(1, ...allValues);
  const ticks = lineChartTickCount(height);
  const labelStep = lineChartLabelStep(labels.length, inner.width);

  const xAt = (i: number, count: number) =>
    margins.left + (count <= 1 ? inner.width / 2 : (i / (count - 1)) * inner.width);
  // v === max lands exactly on `margins.top`, so a spike cannot be clipped.
  const yAt = (v: number) => margins.top + inner.height - (v / max) * inner.height;

  const pointsFor = (data: readonly number[]) =>
    data.map<[number, number]>((v, i) => [xAt(i, data.length), yAt(v)]);
  const pathFor = (data: readonly number[]) =>
    pointsFor(data)
      .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
      .join(" ");

  const tickFont = compact ? 8 : 9;
  const right = margins.left + inner.width;
  const bottom = margins.top + inner.height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="analytics-line-chart"
      role="img"
      aria-label={ariaLabel}
    >
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const y = margins.top + (i / ticks) * inner.height;
        const v = Math.round(max - (i / ticks) * max);
        return (
          <g key={i}>
            <line
              x1={margins.left}
              y1={y}
              x2={right}
              y2={y}
              stroke={CHART_COLORS.border}
              strokeDasharray="2 3"
            />
            <text
              x={margins.left - 5}
              y={y + tickFont / 3}
              textAnchor="end"
              fontSize={tickFont}
              fill={CHART_COLORS.muted}
            >
              {axisValueLabel(v, compact)}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        i % labelStep === 0 ? (
          <text
            key={i}
            x={xAt(i, labels.length)}
            y={height - Math.max(3, margins.bottom - tickFont - 3)}
            textAnchor="middle"
            fontSize={tickFont}
            fill={CHART_COLORS.muted}
          >
            {compact ? compactTickLabel(l) : l}
          </text>
        ) : null,
      )}
      {series.map((s, i) => {
        const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] ?? CHART_COLORS.primary;
        const gradId = `lc-${gid}-${i}`;
        const points = pointsFor(s.data);
        if (points.length === 0) return null;
        return (
          <g key={i}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.25" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {points.length > 1 && (
              <>
                <path
                  d={`${pathFor(s.data)} L${right.toFixed(1)} ${bottom.toFixed(1)} L${margins.left.toFixed(1)} ${bottom.toFixed(1)} Z`}
                  fill={`url(#${gradId})`}
                />
                <path
                  d={pathFor(s.data)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {/* A single reading has no line to draw, so it is drawn as a point
                rather than rendering an empty chart. */}
            {points.length === 1 && (
              <circle cx={points[0]![0]} cy={points[0]![1]} r="3" fill={color} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * `Runs over time`. Fills its widget body: plot on top, legend as a `shrink-0`
 * footer that the plot never has to account for.
 */
export function LineChart({
  series,
  labels,
  ariaLabel = "Runs over time",
}: {
  series: readonly LineSeries[];
  labels: readonly string[];
  ariaLabel?: string;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChartSurfaceFrame
        testId="analytics-line-surface"
        fallbackWidth={600}
        fallbackHeight={170}
      >
        {({ width, height }) => (
          <LinePlot
            series={series}
            labels={labels}
            width={width}
            height={height}
            ariaLabel={ariaLabel}
          />
        )}
      </ChartSurfaceFrame>
      {series.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-x-3.5 gap-y-0.5 pt-1.5">
          {series.map((s, i) => (
            <span
              key={i}
              className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="truncate">{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

