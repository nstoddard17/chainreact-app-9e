"use client";

import { useState } from "react";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
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
}: {
  result: ConnectedAnalyticsResult;
  ariaLabel: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const R = 70;
  const stroke = 22;
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
        className="flex min-h-0 flex-1 flex-wrap items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
          } else if (e.key === "Escape") {
            setActiveId(null);
          }
        }}
        data-testid="insight-donut"
      >
        <svg
          viewBox="-100 -100 200 200"
          width="132"
          height="132"
          className="flex-shrink-0"
          role="img"
          aria-label={ariaLabel}
        >
          <circle cx="0" cy="0" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const len = total > 0 ? ((s.value ?? 0) / total) * C : 0;
            const el = (
              <circle
                key={s.id}
                cx="0"
                cy="0"
                r={R}
                fill="none"
                stroke={insightSeriesColor(i)}
                strokeWidth={activeId === s.id ? stroke + 4 : stroke}
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90)"
                strokeLinecap="butt"
                data-testid={`insight-donut-slice-${s.id}`}
              />
            );
            offset += len;
            return el;
          })}
          <text
            x="0"
            y="-2"
            textAnchor="middle"
            fontSize="20"
            fontWeight="700"
            fill="hsl(var(--foreground))"
          >
            {formatInsightValue(total, result.valueMeta)}
          </text>
          <text x="0" y="16" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">
            {denominatorComplete ? "total" : "shown"}
          </text>
        </svg>

        {/* Text legend — labels + values are readable without hover or color. */}
        <ul className="flex min-w-[150px] flex-1 flex-col gap-1" aria-label="Slices">
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
              <span className="truncate text-foreground/85" title={s.label}>
                {s.label}
              </span>
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
