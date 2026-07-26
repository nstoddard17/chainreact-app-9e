"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ConnectedValueMeta } from "@/contracts/connectedAnalytics";
import type { InsightDrill } from "./insightRefine";
import { formatInsightTick, formatInsightValue } from "./formatInsightValue";

/**
 * Custom Insight line chart (CD-3A).
 *
 * A focused replacement for the legacy `LineChart` primitive, which the
 * insight contract outgrew (it can't render null gaps, >3 series, legend
 * toggles, tooltips, or keyboard access, and it stretches its SVG). The
 * legacy primitive is untouched — existing widgets keep it.
 *
 * Behavior:
 *   - Up to 8 series, colored by FIXED slot order (`--insight-series-N`
 *     theme tokens, validated for light + dark) — a color follows its series,
 *     it is never re-assigned when lines are hidden.
 *   - `null` values are GAPS (no interpolation across missing data); zero is
 *     drawn at zero.
 *   - Legend toggles are local view state: they hide lines without refetching
 *     and never change the saved query.
 *   - Hover + keyboard (arrow keys) move a crosshair; values are announced
 *     via a polite live region and mirrored by the accessible table the
 *     parent renders — nothing is hover-only.
 *   - Geometry uses the measured container width — no SVG stretch.
 */

export interface InsightChartSeries {
  id: string;
  label: string;
  values: readonly (number | null)[];
}

export interface InsightChartBucket {
  start: string;
  end: string;
  label: string;
}

const SLOT_COUNT = 8;

export function insightSeriesColor(index: number): string {
  return `var(--insight-series-${(index % SLOT_COUNT) + 1})`;
}

const COMPARE_COLOR = "hsl(var(--muted-foreground))";

function useMeasuredWidth(fallback: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 40) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Split a value list into drawable segments at null gaps. */
function segments(values: readonly (number | null)[]): { start: number; points: number[] }[] {
  const out: { start: number; points: number[] }[] = [];
  let current: { start: number; points: number[] } | null = null;
  values.forEach((v, i) => {
    if (v === null) {
      current = null;
      return;
    }
    if (!current) {
      current = { start: i, points: [] };
      out.push(current);
    }
    current.points.push(v);
  });
  return out;
}

export function InsightLineChart({
  buckets,
  series,
  compareValues = null,
  valueMeta,
  ariaLabel,
  height = 190,
  bucketDrills = null,
  prevBucketDrills = null,
  onExplore,
}: {
  buckets: readonly InsightChartBucket[];
  series: readonly InsightChartSeries[];
  /** Previous-period values (single-series compare), drawn dashed. */
  compareValues?: readonly (number | null)[] | null;
  valueMeta: ConnectedValueMeta;
  ariaLabel: string;
  height?: number;
  /**
   * CD-5B: index-aligned server-derived drills — a point's own bucket
   * boundaries, and the PREVIOUS window's own bucket for a compared point
   * (Shift+click / Shift+Enter selects it). Null entries stay ordinary
   * readable points; the chart never invents a drill from position or label.
   */
  bucketDrills?: readonly (InsightDrill | null)[] | null;
  prevBucketDrills?: readonly (InsightDrill | null)[] | null;
  onExplore?: (drill: InsightDrill) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [compareHidden, setCompareHidden] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [wrapRef, width] = useMeasuredWidth(600);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const visible = series.filter((s) => !hidden.has(s.id));
  const showCompare = compareValues != null && !compareHidden;

  const pad = { l: 44, r: 10, t: 10, b: 20 };
  const W = Math.max(width, 160);
  const H = height;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = buckets.length;

  const maxValue = useMemo(() => {
    let max = 0;
    for (const s of visible) for (const v of s.values) if (v !== null && v > max) max = v;
    if (showCompare) for (const v of compareValues!) if (v !== null && v > max) max = v;
    return max > 0 ? max : 1;
  }, [visible, showCompare, compareValues]);

  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxValue) * innerH;

  const nearestIndex = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || n === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const px = ((clientX - rect.left) / rect.width) * W;
    const rel = (px - pad.l) / Math.max(innerW, 1);
    return Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1))));
  };

  const move = (delta: number) =>
    setActiveIndex((i) => {
      if (n === 0) return null;
      const base = i ?? (delta > 0 ? -1 : n);
      return Math.min(n - 1, Math.max(0, base + delta));
    });

  const active = activeIndex !== null && activeIndex < n ? activeIndex : null;
  const drillAt = (i: number | null): InsightDrill | null =>
    onExplore && i !== null ? (bucketDrills?.[i] ?? null) : null;
  const prevDrillAt = (i: number | null): InsightDrill | null =>
    onExplore && showCompare && i !== null ? (prevBucketDrills?.[i] ?? null) : null;
  const activeAnnouncement =
    active !== null
      ? `${buckets[active]!.label}: ${visible
          .map((s) => `${s.label} ${formatInsightValue(s.values[active] ?? null, valueMeta)}`)
          .join(", ")}${
          showCompare
            ? `, previous period ${formatInsightValue(compareValues![active] ?? null, valueMeta)}`
            : ""
        }${
          drillAt(active)
            ? `. Press Enter to explore${prevDrillAt(active) ? "; Shift+Enter for the previous period" : ""}.`
            : ""
        }`
      : "";

  const ticks = 4;
  const showLegend = series.length >= 2 || compareValues != null;
  const labelStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 70))));

  return (
    <div className="flex h-full min-h-0 flex-col gap-1" ref={wrapRef}>
      <div
        className="relative min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            setActiveIndex(n > 0 ? 0 : null);
          } else if (e.key === "End") {
            e.preventDefault();
            setActiveIndex(n > 0 ? n - 1 : null);
          } else if (e.key === "Enter" || e.key === " ") {
            // CD-5B: drill the active point. Shift selects the previous-period
            // point's own dates when one exists.
            const drill = e.shiftKey ? prevDrillAt(active) : drillAt(active);
            if (drill) {
              e.preventDefault();
              onExplore!(drill);
            }
          } else if (e.key === "Escape") {
            setActiveIndex(null);
          }
        }}
        onBlur={() => setActiveIndex(null)}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-hidden
          className={drillAt(active) ? "cursor-pointer" : undefined}
          onMouseMove={(e) => setActiveIndex(nearestIndex(e.clientX))}
          onMouseLeave={() => setActiveIndex(null)}
          onClick={(e) => {
            const i = nearestIndex(e.clientX);
            const drill = e.shiftKey ? prevDrillAt(i) : drillAt(i);
            if (drill) onExplore!(drill);
          }}
        >
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const gy = pad.t + (i / ticks) * innerH;
            const v = maxValue - (i / ticks) * maxValue;
            return (
              <g key={i}>
                <line
                  x1={pad.l}
                  y1={gy}
                  x2={W - pad.r}
                  y2={gy}
                  stroke="hsl(var(--border))"
                  strokeDasharray="2 3"
                />
                <text
                  x={pad.l - 6}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="hsl(var(--muted-foreground))"
                >
                  {formatInsightTick(v, valueMeta)}
                </text>
              </g>
            );
          })}
          {buckets.map((b, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={H - 5}
                textAnchor="middle"
                fontSize="9"
                fill="hsl(var(--muted-foreground))"
              >
                {b.label}
              </text>
            ) : null,
          )}

          {showCompare &&
            segments(compareValues!).map((seg, si) => (
              <path
                key={`c-${si}`}
                d={seg.points
                  .map(
                    (v, i) =>
                      `${i === 0 ? "M" : "L"}${x(seg.start + i).toFixed(1)} ${y(v).toFixed(1)}`,
                  )
                  .join(" ")}
                fill="none"
                stroke={COMPARE_COLOR}
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            ))}

          {series.map((s, seriesIdx) => {
            if (hidden.has(s.id)) return null;
            const color = insightSeriesColor(seriesIdx);
            return (
              <g key={s.id} data-testid={`insight-series-${s.id}`}>
                {segments(s.values).map((seg, si) =>
                  seg.points.length === 1 ? (
                    <circle
                      key={si}
                      cx={x(seg.start)}
                      cy={y(seg.points[0]!)}
                      r="2.5"
                      fill={color}
                    />
                  ) : (
                    <path
                      key={si}
                      d={seg.points
                        .map(
                          (v, i) =>
                            `${i === 0 ? "M" : "L"}${x(seg.start + i).toFixed(1)} ${y(v).toFixed(1)}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ),
                )}
              </g>
            );
          })}

          {active !== null && (
            <g>
              <line
                x1={x(active)}
                y1={pad.t}
                x2={x(active)}
                y2={pad.t + innerH}
                stroke="hsl(var(--foreground))"
                strokeOpacity="0.35"
              />
              {series.map((s, seriesIdx) => {
                if (hidden.has(s.id)) return null;
                const v = s.values[active];
                if (v == null) return null;
                return (
                  <circle
                    key={s.id}
                    cx={x(active)}
                    cy={y(v)}
                    r="3.5"
                    fill={insightSeriesColor(seriesIdx)}
                    stroke="hsl(var(--card))"
                    strokeWidth="1.5"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 max-w-[240px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
            style={
              x(active) > W / 2
                ? { right: `${Math.max(0, W - x(active) + 8)}px` }
                : { left: `${x(active) + 8}px` }
            }
            data-testid="insight-chart-tooltip"
          >
            <div className="mb-0.5 font-semibold text-foreground">{buckets[active]!.label}</div>
            {visible.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: insightSeriesColor(series.indexOf(s)) }}
                    aria-hidden
                  />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatInsightValue(s.values[active] ?? null, valueMeta)}
                </span>
              </div>
            ))}
            {showCompare && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Previous period</span>
                <span className="font-mono font-medium text-foreground">
                  {formatInsightValue(compareValues![active] ?? null, valueMeta)}
                </span>
              </div>
            )}
          </div>
        )}
        <span className="sr-only" role="status" aria-live="polite">
          {activeAnnouncement}
        </span>
      </div>

      {visible.length === 0 && (
        <div className="text-center text-[11px] text-muted-foreground">
          All lines are hidden — use the legend to show one.
        </div>
      )}

      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="list" aria-label="Chart legend">
          {series.map((s, seriesIdx) => {
            const off = hidden.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                aria-pressed={!off}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted " +
                  (off ? "text-muted-foreground/50 line-through" : "text-muted-foreground")
                }
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                title={off ? `Show ${s.label}` : `Hide ${s.label}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: insightSeriesColor(seriesIdx), opacity: off ? 0.35 : 1 }}
                  aria-hidden
                />
                <span className="max-w-[140px] truncate">{s.label}</span>
              </button>
            );
          })}
          {compareValues != null && (
            <button
              type="button"
              role="listitem"
              aria-pressed={!compareHidden}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted " +
                (compareHidden ? "text-muted-foreground/50 line-through" : "text-muted-foreground")
              }
              onClick={() => setCompareHidden((v) => !v)}
            >
              <span
                className="inline-block h-0 w-3 border-t-2 border-dashed"
                style={{ borderColor: COMPARE_COLOR, opacity: compareHidden ? 0.35 : 1 }}
                aria-hidden
              />
              <span>Previous period</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
