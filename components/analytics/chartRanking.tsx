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

import { CHART_COLORS, ChartSurfaceFrame, formatNumber } from "./chartPrimitives";
import { barChartMetrics, isCompactChartWidth } from "@/core/analytics/chartSizing";

// ── BarChart — horizontal top-N ──────────────────────────────────────────────

export interface BarRow {
  label: string;
  value: number;
  color?: string;
}

/** Height reserved for the "+N more" note when the body cannot hold every row. */
const BAR_NOTE_HEIGHT = 15;

/** The bar rows at an explicit size: `label | bar | value`, no fixed pixels. */
export function BarRows({
  rows,
  width,
  height,
  color = CHART_COLORS.primary,
  animate = true,
}: {
  rows: readonly BarRow[];
  width: number;
  height: number;
  color?: string;
  animate?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  // Two passes: the note only exists if rows had to be dropped, and it takes
  // room from the rows if it does. Deciding in one pass would either always
  // reserve the note's height or let it overlap the last row.
  //
  // The allowance includes ONE MORE ROW GAP, because the note is a flex sibling
  // of the rows and the column's `rowGap` applies between them too. Forgetting
  // that gap is a three-pixel overflow — which the browser suite caught as a
  // scrolling chart body.
  const first = barChartMetrics({ width, height, rowCount: rows.length });
  const metrics =
    first.hiddenRows > 0
      ? barChartMetrics({
          width,
          height: height - BAR_NOTE_HEIGHT - first.rowGap,
          rowCount: rows.length,
        })
      : first;
  if (metrics.visibleRows <= 0) return null;

  const compact = isCompactChartWidth(width);
  const shown = rows.slice(0, metrics.visibleRows);
  const hidden = rows.length - shown.length;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      style={{ rowGap: metrics.rowGap }}
      data-testid="analytics-bar-rows"
    >
      {shown.map((r, i) => (
        <div
          key={i}
          data-testid="analytics-bar-row"
          className="grid min-w-0 shrink-0 items-center"
          style={{
            height: metrics.rowHeight,
            gridTemplateColumns: `minmax(0, ${metrics.labelMaxPx}px) minmax(0, 1fr) auto`,
            columnGap: compact ? 8 : 12,
          }}
        >
          <div
            className={
              "truncate text-foreground/80 " + (compact ? "text-[11px]" : "text-xs")
            }
            title={r.label}
          >
            {r.label}
          </div>
          <div
            className="min-w-0 overflow-hidden rounded-full bg-muted"
            style={{ height: metrics.barHeight }}
          >
            <div
              data-testid="analytics-bar-fill"
              className={
                "h-full rounded-full " +
                (animate ? "transition-[width] duration-500 motion-reduce:transition-none" : "")
              }
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }}
            />
          </div>
          <div
            className={
              "whitespace-nowrap text-right font-mono font-semibold text-foreground " +
              (compact ? "text-[11px]" : "text-xs")
            }
          >
            {formatNumber(r.value)}
          </div>
        </div>
      ))}
      {hidden > 0 && (
        <div
          className="shrink-0 truncate text-[10.5px] text-muted-foreground"
          style={{ height: BAR_NOTE_HEIGHT }}
          data-testid="analytics-bar-overflow-note"
        >
          +{hidden} more — make this widget taller to see {hidden === 1 ? "it" : "them"}
        </div>
      )}
    </div>
  );
}

/** `Top automations by runs` / `Connected apps` — a horizontal ranking chart. */
export function BarChart({
  rows,
  color = CHART_COLORS.primary,
}: {
  rows: readonly BarRow[];
  color?: string;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ChartSurfaceFrame testId="analytics-bar-surface" fallbackWidth={420} fallbackHeight={160}>
        {({ width, height, animate }) => (
          <BarRows rows={rows} width={width} height={height} color={color} animate={animate} />
        )}
      </ChartSurfaceFrame>
    </div>
  );
}

