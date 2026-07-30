"use client";

import { useState } from "react";
import type { ConnectedAnalyticsResult, ConnectedRefine } from "@/contracts/connectedAnalytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { useChartSize } from "@/components/analytics/ResponsiveChartSurface";
import { donutCenterTypography, donutLayout, donutRadii } from "@/core/analytics/chartSizing";
import { formatInsightValue } from "./formatInsightValue";
import { insightSeriesColor } from "./InsightLineChart";

/**
 * Custom Insight donut (CD-3B) — the most abusable chart type, so it carries
 * the most guardrails.
 *
 * Availability is decided upstream by the CATALOG (`partToWholeDimensions`)
 * and re-validated server-side; a user can never force a donut onto a query
 * whose parts don't add up. This component owns the remaining honesty rule:
 * **percent-of-total is shown only when the denominator is genuinely
 * complete.** The whole is trustworthy only when
 *   - the result's structured completeness is `complete`, AND
 *   - no row cap trimmed categories away (rows ≤ the slice max).
 * Otherwise the slices still render (partial data stays visible — CD-3A's
 * rule) but percentages are suppressed and a plain-language warning says the
 * total is incomplete. An `Other` slice is NEVER synthesized: if the backend
 * doesn't supply a remainder row, none is invented.
 *
 * Identity never depends on color: every slice is listed as text with its
 * label and value beside its swatch, and the same numbers are reachable by
 * keyboard and screen reader.
 */

/** Palette slots available; more categories than this can't be a clean whole. */
export const DONUT_MAX_SLICES = 8;

export function InsightDonutChart({
  result,
  ariaLabel,
  onExplore,
}: {
  result: ConnectedAnalyticsResult;
  ariaLabel: string;
  /**
   * CD-5B: invoked with a slice's SERVER-ISSUED refinement. Slices without one
   * (synthetic, surrogate-keyed, or otherwise unrefinable) stay ordinary
   * readable values — the donut never invents drillability from a label.
   */
  onExplore?: (refine: ConnectedRefine) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // The ring is sized from the box it is actually given
  // (ANALYTICS-RESPONSIVE-CHART-SURFACES-1) rather than the fixed 132px square
  // it used to be, so it grows in a tall widget and gets out of the legend's way
  // in a narrow one. `flex-wrap` on the row already stacks the legend below.
  const [plotRef, plotSize] = useChartSize({ fallbackWidth: 420, fallbackHeight: 190 });
  const rows = (result.rows ?? []).filter((r) => r.value !== null && r.value > 0);
  const allRows = result.rows ?? [];

  if (allRows.length === 0) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center text-xs text-muted-foreground">
        No data in this range yet.
      </div>
    );
  }

  const slices = rows.slice(0, DONUT_MAX_SLICES);
  const trimmed = allRows.length > DONUT_MAX_SLICES;
  const total = slices.reduce((n, r) => n + (r.value ?? 0), 0);
  // The denominator is only meaningful when nothing was capped or omitted.
  const denominatorComplete =
    result.completeness.state === "complete" && !trimmed && total > 0;

  const layout = donutLayout({
    width: plotSize.width,
    height: plotSize.height,
    sliceCount: slices.length,
  });
  const { outerRadius: R, innerRadius, strokeWidth: stroke } = donutRadii({
    width: layout.diameter,
    height: layout.diameter,
  });
  const mid = layout.diameter / 2;
  const centerText = formatInsightValue(total, result.valueMeta);
  const centerType = donutCenterTypography(innerRadius, centerText.length);
  const C = Math.PI * 2 * R;
  let offset = 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {!denominatorComplete && (
        <p
          className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[10.5px] text-warning"
          role="status"
        >
          {trimmed
            ? `Showing the ${DONUT_MAX_SLICES} largest groups of ${allRows.length} — these slices don't add up to the full total, so shares aren't shown.`
            : "This data may be incomplete, so it isn't shown as a share of the total."}
        </p>
      )}

      <div
        ref={plotRef}
        className={
          // Side-by-side when both fit, stacked when they don't — a decision
          // taken from the measured box rather than left to `flex-wrap`, so the
          // ring's diameter and the layout always agree.
          "flex min-h-0 min-w-0 flex-1 gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 " +
          (layout.orientation === "side"
            ? "flex-row items-center"
            : "flex-col items-center")
        }
        data-donut-orientation={layout.orientation}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            setActiveId((id) => {
              const i = slices.findIndex((s) => s.id === id);
              return slices[Math.min(slices.length - 1, i + 1)]?.id ?? slices[0]?.id ?? null;
            });
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            setActiveId((id) => {
              const i = slices.findIndex((s) => s.id === id);
              return slices[Math.max(0, i - 1)]?.id ?? slices[0]?.id ?? null;
            });
          } else if (e.key === "Enter" || e.key === " ") {
            // Drill the active slice — only when the server issued a
            // refinement for it (CD-5B).
            const activeSlice = slices.find((s) => s.id === activeId);
            if (onExplore && activeSlice?.refine) {
              e.preventDefault();
              onExplore(activeSlice.refine);
            }
          } else if (e.key === "Escape") {
            setActiveId(null);
          }
        }}
        data-testid="insight-donut"
      >
        {layout.diameter > 0 && R > 0 && (
          <svg
            viewBox={`0 0 ${layout.diameter} ${layout.diameter}`}
            width={layout.diameter}
            height={layout.diameter}
            className="flex-shrink-0"
            data-donut-diameter={layout.diameter}
            role="img"
            aria-label={ariaLabel}
          >
            <circle
              cx={mid}
              cy={mid}
              r={R}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={stroke}
            />
            {slices.map((s, i) => {
              const len = total > 0 ? ((s.value ?? 0) / total) * C : 0;
              const el = (
                <circle
                  key={s.id}
                  cx={mid}
                  cy={mid}
                  r={R}
                  fill="none"
                  stroke={insightSeriesColor(i)}
                  // The active slice thickens INWARD only: growing the stroke
                  // outward would push the ring past the box on hover.
                  strokeWidth={activeId === s.id ? stroke + 4 : stroke}
                  strokeDasharray={`${len} ${C}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${mid} ${mid})`}
                  strokeLinecap="butt"
                  data-testid={`insight-donut-slice-${s.id}`}
                />
              );
              offset += len;
              return el;
            })}
            <text
              x={mid}
              y={mid + (centerType.showLabel ? 0 : centerType.valueFontSize * 0.35)}
              textAnchor="middle"
              fontSize={centerType.valueFontSize}
              fontWeight="700"
              fill="hsl(var(--foreground))"
            >
              {centerText}
            </text>
            {centerType.showLabel && (
              <text
                x={mid}
                y={mid + centerType.valueFontSize * 0.85}
                textAnchor="middle"
                fontSize={centerType.labelFontSize}
                fill="hsl(var(--muted-foreground))"
              >
                {denominatorComplete ? "total" : "shown"}
              </text>
            )}
          </svg>
        )}

        {/* Text legend — labels + values are readable without hover or color.
            A slice with a server refinement renders its label as an explicit
            Explore button (CD-5B); every other slice is a plain readable row —
            never a fake click target and never in the tab order for nothing. */}
        <ul
          className={
            "flex min-w-0 flex-col gap-1 " +
            (layout.orientation === "side" ? "flex-1" : "w-full shrink-0")
          }
          aria-label="Slices"
        >
          {slices.map((s, i) => (
            <li
              key={s.id}
              className={
                "grid grid-cols-[10px_1fr_auto] items-center gap-2 rounded-sm px-0.5 text-[11px] " +
                (activeId === s.id ? "bg-muted" : "")
              }
              onMouseEnter={() => setActiveId(s.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: insightSeriesColor(i) }}
                aria-hidden
              />
              {onExplore && s.refine ? (
                <button
                  type="button"
                  className="cursor-pointer truncate text-left text-foreground/85 underline-offset-2 hover:text-primary hover:underline"
                  title={`Explore ${s.label}`}
                  aria-label={`Explore ${s.label}`}
                  onClick={() => onExplore(s.refine!)}
                >
                  {s.label}
                </button>
              ) : (
                <span className="truncate text-foreground/85" title={s.label}>
                  {s.label}
                </span>
              )}
              <span className="font-mono text-foreground">
                {formatInsightValue(s.value, result.valueMeta)}
                {denominatorComplete && (
                  <span className="ml-1 text-muted-foreground">
                    ({Math.round(((s.value ?? 0) / total) * 100)}%)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {rows.length < allRows.length && !trimmed && (
        <p className="text-[10px] text-muted-foreground">
          <AnalyticsIcon name="Filter" size={9} />{" "}
          {allRows.length - rows.length} group
          {allRows.length - rows.length === 1 ? "" : "s"} with no value{" "}
          {allRows.length - rows.length === 1 ? "is" : "are"} not shown.
        </p>
      )}
    </div>
  );
}
