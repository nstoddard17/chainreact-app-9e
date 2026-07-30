"use client";

/**
 * Shared pieces every Analytics chart uses: the palette, the measured plot
 * frame, the big-number readout and the value formatters
 * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * Import charts from `@/components/analytics/charts` — it re-exports this module
 * along with every chart family.
 */

import type { ReactNode } from "react";
import {
  ResponsiveChartSurface,
  type ChartSurfaceSize,
} from "@/components/analytics/ResponsiveChartSurface";

/** Shared chart palette (theme-token based; purple is a fixed accent). */
export const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  danger: "hsl(var(--destructive))",
  purple: "#a78bfa",
  muted: "hsl(var(--muted-foreground))",
  border: "hsl(var(--border))",
  text: "hsl(var(--foreground))",
} as const;

// ── Surface frame ─────────────────────────────────────────────────

/**
 * The `flex-1` measured plot region every chart drops its plot into. It is
 * `relative` so the surface can fill it absolutely — that is what stops the plot
 * from ever feeding its own size back into the measurement.
 */
export function ChartSurfaceFrame({
  children,
  testId,
  fallbackWidth,
  fallbackHeight,
  minimumWidth,
  minimumHeight,
}: {
  children: (size: ChartSurfaceSize) => ReactNode;
  testId: string;
  fallbackWidth?: number;
  fallbackHeight?: number;
  /** Charts with no axes stay meaningful in a smaller box than axed ones do. */
  minimumWidth?: number;
  minimumHeight?: number;
}) {
  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <ResponsiveChartSurface
        testId={testId}
        {...(fallbackWidth === undefined ? {} : { fallbackWidth })}
        {...(fallbackHeight === undefined ? {} : { fallbackHeight })}
        {...(minimumWidth === undefined ? {} : { minimumWidth })}
        {...(minimumHeight === undefined ? {} : { minimumHeight })}
      >
        {children}
      </ResponsiveChartSurface>
    </div>
  );
}

// ── MetricNumber — big number + trend vs previous ────────────────────────────

export function MetricNumber({
  value,
  previous,
  suffix = "",
}: {
  value: number;
  previous?: number | null;
  suffix?: string;
}) {
  const display = formatNumber(value) + suffix;
  const trend =
    previous != null && previous > 0 ? ((value - previous) / previous) * 100 : null;
  const up = trend != null && trend >= 0;
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1">
      <div className="truncate text-3xl font-bold leading-none tracking-tight text-foreground">
        {display}
      </div>
      {trend != null && (
        <div
          className={
            "inline-flex items-center gap-1 text-xs font-medium " +
            (up ? "text-success" : "text-destructive")
          }
        >
          <span aria-hidden>{up ? "↑" : "↓"}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
          <span className="ml-0.5 font-normal text-muted-foreground">vs prev</span>
        </div>
      )}
    </div>
  );
}


// ── helpers ──────────────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
