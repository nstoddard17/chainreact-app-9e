"use client";

import { useState } from "react";
import type { ConnectedValueMeta } from "@/contracts/connectedAnalytics";
import { useChartSize } from "@/components/analytics/ResponsiveChartSurface";
import { formatInsightValue } from "./formatInsightValue";
import { insightSeriesColor } from "./InsightLineChart";
import { InsightBarLegend } from "./InsightBarLegend";
import type { InsightDrill } from "./insightRefine";

/**
 * Custom Insight bar chart (CD-3B).
 *
 * Renders BOTH connected result shapes through one component:
 *   - categorical → one bar per row (the row order is the server's, which the
 *     saved query's `sort` decided — the chart never re-sorts).
 *   - time series → grouped bars per bucket, up to 8 series in fixed
 *     palette-slot order (identical colors to the line chart, so switching
 *     chart type never repaints a series).
 *
 * Honesty rules shared with the line chart: `null` is a GAP (no bar, an
 * explicit "—" in the accessible views), zero draws a zero-height stub so it
 * reads as a real zero, one measure/one axis only, no mixed units.
 *
 * Orientation is automatic: horizontal bars when the labels are long or
 * numerous (or the widget is narrow), vertical columns otherwise — which is
 * also what keeps category names readable instead of truncated at 320px.
 */

export interface InsightBarGroup {
  /** Stable id (bucket start or row id). */
  id: string;
  label: string;
  /** One value per series (single-series categorical results have length 1). */
  values: readonly (number | null)[];
}

export interface InsightBarSeries {
  id: string;
  label: string;
}

const MIN_BAR_PX = 3;

/**
 * Previous-period bars are muted AND hatched — never color alone, so the two
 * periods stay separable in greyscale and for color-blind readers. Matches the
 * line chart's dashed-and-muted treatment.
 */
const COMPARE_FILL =
  "repeating-linear-gradient(135deg, hsl(var(--muted-foreground)) 0 3px, transparent 3px 6px)";
const COMPARE_LABEL = "Previous period";

/**
 * Pick an orientation. Horizontal wins when names need the room — long
 * labels, many categories, or a narrow widget — because a rotated/truncated
 * category name is the failure this chart is most prone to.
 */
export function preferHorizontal(
  labels: readonly string[],
  width: number,
  isTime: boolean,
): boolean {
  if (isTime) return false; // time always reads left → right
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
  return labels.length > 6 || longest > 14 || width < 380;
}

export function InsightBarChart({
  groups,
  series,
  valueMeta,
  ariaLabel,
  isTime = false,
  compareValues = null,
  groupDrills = null,
  compareDrills = null,
  onExplore,
}: {
  groups: readonly InsightBarGroup[];
  series: readonly InsightBarSeries[];
  valueMeta: ConnectedValueMeta;
  ariaLabel: string;
  isTime?: boolean;
  /**
   * Previous-period values, index-aligned to `groups` (CD-5A). Only ever
   * supplied for a single-series TIME chart — the only shape the result
   * contract carries a comparison for — so each group gets one paired bar.
   * Categorical results have no previous value per row and never pass this.
   */
  compareValues?: readonly (number | null)[] | null;
  /**
   * CD-5B: index-aligned server-derived drills for each group (a bucket's own
   * boundaries or a row's server-issued refinement) and for each paired
   * previous bar (the previous window's own bucket). A null entry means that
   * value is an ordinary readable bar — the chart never invents a drill from
   * a label or an index.
   */
  groupDrills?: readonly (InsightDrill | null)[] | null;
  compareDrills?: readonly (InsightDrill | null)[] | null;
  onExplore?: (drill: InsightDrill) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [compareHidden, setCompareHidden] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // The one shared measurement seam (ANALYTICS-RESPONSIVE-CHART-SURFACES-1);
  // this file used to carry its own private width-only copy of it.
  const [wrapRef, { width }] = useChartSize({ fallbackWidth: 560, fallbackHeight: 190 });

  const visibleSeriesIdx = series.map((_, i) => i).filter((i) => !hidden.has(series[i]!.id));
  const horizontal = preferHorizontal(
    groups.map((g) => g.label),
    width,
    isTime,
  );

  const showCompare = compareValues != null && !compareHidden;

  const drillAt = (i: number | null): InsightDrill | null =>
    onExplore && i !== null ? (groupDrills?.[i] ?? null) : null;
  const compareDrillAt = (i: number | null): InsightDrill | null =>
    onExplore && showCompare && i !== null ? (compareDrills?.[i] ?? null) : null;

  let max = 0;
  for (const g of groups) {
    for (const i of visibleSeriesIdx) {
      const v = g.values[i];
      if (v != null && v > max) max = v;
    }
  }
  if (showCompare) {
    for (const v of compareValues) if (v != null && v > max) max = v;
  }
  const scaleMax = max > 0 ? max : 1;

  const active = activeIndex !== null && activeIndex < groups.length ? activeIndex : null;
  const announcement =
    active !== null
      ? `${groups[active]!.label}: ${visibleSeriesIdx
          .map(
            (i) =>
              `${series[i]!.label} ${formatInsightValue(groups[active]!.values[i] ?? null, valueMeta)}`,
          )
          .join(", ")}${
          showCompare
            ? `, previous period ${formatInsightValue(compareValues[active] ?? null, valueMeta)}`
            : ""
        }${
          drillAt(active)
            ? `. Press Enter to explore${compareDrillAt(active) ? "; Shift+Enter for the previous period" : ""}.`
            : ""
        }`
      : "";

  const move = (delta: number) =>
    setActiveIndex((i) => {
      if (groups.length === 0) return null;
      const base = i ?? (delta > 0 ? -1 : groups.length);
      return Math.min(groups.length - 1, Math.max(0, base + delta));
    });

  const showLegend = series.length >= 2 || compareValues != null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1" ref={wrapRef}>
      <div
        className="min-h-0 flex-1 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          const fwd = horizontal ? "ArrowDown" : "ArrowRight";
          const back = horizontal ? "ArrowUp" : "ArrowLeft";
          if (e.key === fwd || e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          } else if (e.key === back || e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Home") {
            e.preventDefault();
            setActiveIndex(groups.length > 0 ? 0 : null);
          } else if (e.key === "End") {
            e.preventDefault();
            setActiveIndex(groups.length > 0 ? groups.length - 1 : null);
          } else if (e.key === "Enter" || e.key === " ") {
            // CD-5B: drill the active bar. Shift selects the paired
            // previous-period bar when one exists.
            const drill = e.shiftKey ? compareDrillAt(active) : drillAt(active);
            if (drill) {
              e.preventDefault();
              onExplore!(drill);
            }
          } else if (e.key === "Escape") {
            setActiveIndex(null);
          }
        }}
        onBlur={() => setActiveIndex(null)}
        data-orientation={horizontal ? "horizontal" : "vertical"}
        data-testid="insight-bar-chart"
      >
        {horizontal ? (
          <div className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
            {groups.map((g, gi) => (
              <div
                key={g.id}
                className={
                  "grid grid-cols-[minmax(0,38%)_1fr] items-center gap-2 rounded-sm px-0.5 " +
                  (active === gi ? "bg-muted" : "") +
                  (drillAt(gi) ? " cursor-pointer" : "")
                }
                onMouseEnter={() => setActiveIndex(gi)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => {
                  const drill = drillAt(gi);
                  if (drill) onExplore!(drill);
                }}
                {...(drillAt(gi) ? { title: `Explore ${g.label}` } : {})}
                data-drillable={drillAt(gi) ? "true" : undefined}
                data-testid={`insight-bar-group-${g.id}`}
              >
                <div className="truncate text-[11px] text-foreground/80" title={g.label}>
                  {g.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {visibleSeriesIdx.map((si) => {
                    const v = g.values[si];
                    return (
                      <div key={si} className="flex items-center gap-1.5">
                        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          {v != null && (
                            <div
                              className="h-full rounded-full motion-reduce:transition-none"
                              style={{
                                width: `max(${MIN_BAR_PX}px, ${(v / scaleMax) * 100}%)`,
                                background: insightSeriesColor(si),
                              }}
                              data-testid={`insight-bar-${g.id}-${series[si]!.id}`}
                            />
                          )}
                        </div>
                        <span className="min-w-[46px] shrink-0 text-right font-mono text-[10.5px] text-foreground">
                          {formatInsightValue(v ?? null, valueMeta)}
                        </span>
                      </div>
                    );
                  })}
                  {showCompare &&
                    (() => {
                      const pv = compareValues[gi] ?? null;
                      const prevDrill = compareDrillAt(gi);
                      return (
                        <div
                          className={
                            "flex items-center gap-1.5" + (prevDrill ? " cursor-pointer" : "")
                          }
                          title={prevDrill ? `Explore ${COMPARE_LABEL}` : COMPARE_LABEL}
                          onClick={(e) => {
                            if (!prevDrill) return;
                            // The previous bar drills into ITS dates, not the group's.
                            e.stopPropagation();
                            onExplore!(prevDrill);
                          }}
                        >
                          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                            {pv != null && (
                              <div
                                className="h-full rounded-full motion-reduce:transition-none"
                                style={{
                                  width: `max(${MIN_BAR_PX}px, ${(pv / scaleMax) * 100}%)`,
                                  background: COMPARE_FILL,
                                }}
                                data-testid={`insight-bar-compare-${g.id}`}
                                data-compare-pattern="hatched"
                              />
                            )}
                          </div>
                          <span className="min-w-[46px] shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">
                            {formatInsightValue(pv, valueMeta)}
                          </span>
                        </div>
                      );
                    })()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-end gap-1.5 overflow-x-auto pb-5">
            {groups.map((g, gi) => (
              <div
                key={g.id}
                className={
                  "relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm " +
                  (active === gi ? "bg-muted" : "") +
                  (drillAt(gi) ? " cursor-pointer" : "")
                }
                onMouseEnter={() => setActiveIndex(gi)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => {
                  const drill = drillAt(gi);
                  if (drill) onExplore!(drill);
                }}
                {...(drillAt(gi) ? { title: `Explore ${g.label}` } : {})}
                data-drillable={drillAt(gi) ? "true" : undefined}
                data-testid={`insight-bar-group-${g.id}`}
              >
                {/* Direct value label — only for a single series, where it
                    can't crowd; grouped bars rely on the tooltip, keyboard
                    announcements, and the accessible table instead. */}
                {series.length === 1 && !showCompare && (
                  <div className="mb-0.5 truncate text-center font-mono text-[9.5px] text-foreground">
                    {formatInsightValue(g.values[0] ?? null, valueMeta)}
                  </div>
                )}
                <div className="flex h-full items-end justify-center gap-[2px]">
                  {visibleSeriesIdx.map((si) => {
                    const v = g.values[si];
                    return (
                      <div
                        key={si}
                        className="flex h-full min-w-[3px] flex-1 items-end"
                        title={`${series[si]!.label}: ${formatInsightValue(v ?? null, valueMeta)}`}
                      >
                        {v != null && (
                          <div
                            className="w-full rounded-t-[3px] motion-reduce:transition-none"
                            style={{
                              height: `max(${MIN_BAR_PX}px, ${(v / scaleMax) * 100}%)`,
                              background: insightSeriesColor(si),
                            }}
                            data-testid={`insight-bar-${g.id}-${series[si]!.id}`}
                          />
                        )}
                      </div>
                    );
                  })}
                  {showCompare &&
                    (() => {
                      const pv = compareValues[gi] ?? null;
                      const prevDrill = compareDrillAt(gi);
                      return (
                        <div
                          className={
                            "flex h-full min-w-[3px] flex-1 items-end" +
                            (prevDrill ? " cursor-pointer" : "")
                          }
                          title={
                            prevDrill
                              ? `Explore ${COMPARE_LABEL}: ${formatInsightValue(pv, valueMeta)}`
                              : `${COMPARE_LABEL}: ${formatInsightValue(pv, valueMeta)}`
                          }
                          onClick={(e) => {
                            if (!prevDrill) return;
                            e.stopPropagation();
                            onExplore!(prevDrill);
                          }}
                        >
                          {pv != null && (
                            <div
                              className="w-full rounded-t-[3px] motion-reduce:transition-none"
                              style={{
                                height: `max(${MIN_BAR_PX}px, ${(pv / scaleMax) * 100}%)`,
                                background: COMPARE_FILL,
                              }}
                              data-testid={`insight-bar-compare-${g.id}`}
                              data-compare-pattern="hatched"
                            />
                          )}
                        </div>
                      );
                    })()}
                </div>
                <div
                  className="absolute -bottom-5 left-0 right-0 truncate text-center text-[9.5px] text-muted-foreground"
                  title={g.label}
                >
                  {g.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {active !== null && (
        <div
          className="rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-sm"
          data-testid="insight-bar-tooltip"
        >
          <span className="font-semibold text-foreground">{groups[active]!.label}</span>
          {visibleSeriesIdx.map((si) => (
            <span key={si} className="ml-2 text-muted-foreground">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: insightSeriesColor(si) }}
                aria-hidden
              />
              {series.length > 1 || showCompare ? `${series[si]!.label}: ` : ""}
              <span className="font-mono text-foreground">
                {formatInsightValue(groups[active]!.values[si] ?? null, valueMeta)}
              </span>
            </span>
          ))}
          {showCompare && (
            <span className="ml-2 text-muted-foreground">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: COMPARE_FILL }}
                aria-hidden
              />
              {`${COMPARE_LABEL}: `}
              <span className="font-mono text-foreground">
                {formatInsightValue(compareValues[active] ?? null, valueMeta)}
              </span>
            </span>
          )}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {showLegend && (
        <InsightBarLegend
          series={series}
          hidden={hidden}
          onToggleSeries={(id) =>
            setHidden((h) => {
              const nextSet = new Set(h);
              if (nextSet.has(id)) nextSet.delete(id);
              else nextSet.add(id);
              return nextSet;
            })
          }
          compareLabel={COMPARE_LABEL}
          compareFill={COMPARE_FILL}
          showCompareEntry={compareValues != null}
          compareHidden={compareHidden}
          onToggleCompare={() => setCompareHidden((v) => !v)}
        />
      )}
    </div>
  );
}
