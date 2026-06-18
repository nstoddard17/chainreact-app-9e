"use client";

/**
 * Analytics chart primitives (Slice ANALYTICS-1) — pure SVG, ported from the
 * Claude Design "Analytics.html" and re-themed onto the V2 dark-dashboard HSL
 * tokens (`hsl(var(--primary))`, `--success`, `--destructive`, `--border`,
 * `--foreground`, `--muted-foreground`). No external chart dependency.
 *
 * All inputs are real, account-scoped aggregates from `AnalyticsOverview`.
 */

import { useId } from "react";

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

const SERIES_COLORS = [CHART_COLORS.primary, CHART_COLORS.purple, CHART_COLORS.success];

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
    <div className="flex flex-col gap-1">
      <div className="text-3xl font-bold leading-none tracking-tight text-foreground">
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

// ── Sparkline ────────────────────────────────────────────────────────────────

export function Sparkline({
  data,
  width = 140,
  height = 42,
  color = CHART_COLORS.primary,
}: {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const id = useId();
  if (data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden />
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const pts = data.map<[number, number]>((v, i) => [
    (i / (data.length - 1)) * width,
    height - 4 - ((v - min) / range) * (height - 8),
  ]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend">
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
      <title>{id}</title>
    </svg>
  );
}

// ── LineChart — multi-series with axes ───────────────────────────────────────

export interface LineSeries {
  name: string;
  data: readonly number[];
  color?: string;
}

export function LineChart({
  series,
  labels,
  height = 220,
}: {
  series: readonly LineSeries[];
  labels: readonly string[];
  height?: number;
}) {
  const gid = useId();
  const W = 600;
  const H = height;
  const pad = { l: 38, r: 14, t: 14, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(1, ...allValues);
  const ticks = 4;

  const pointsFor = (data: readonly number[]) =>
    data.map<[number, number]>((v, i) => [
      pad.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerW),
      pad.t + innerH - (v / max) * innerH,
    ]);
  const pathFor = (data: readonly number[]) =>
    pointsFor(data)
      .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
      .join(" ");

  // Thin labels so the axis doesn't crowd on long ranges.
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" role="img" aria-label="Runs over time">
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const y = pad.t + (i / ticks) * innerH;
          const v = Math.round(max - (i / ticks) * max);
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke={CHART_COLORS.border} strokeDasharray="2 3" />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="9" fill={CHART_COLORS.muted}>
                {v}
              </text>
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={pad.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * innerW)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill={CHART_COLORS.muted}
            >
              {l}
            </text>
          ) : null,
        )}
        {series.map((s, i) => {
          const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] ?? CHART_COLORS.primary;
          const gradId = `lc-${gid}-${i}`;
          return (
            <g key={i}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={color} stopOpacity="0.25" />
                  <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${pathFor(s.data)} L${pad.l + innerW} ${pad.t + innerH} L${pad.l} ${pad.t + innerH} Z`} fill={`url(#${gradId})`} />
              <path d={pathFor(s.data)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3.5 pl-9 pt-2">
        {series.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span>{s.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── BarChart — horizontal top-N ──────────────────────────────────────────────

export interface BarRow {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({ rows, color = CHART_COLORS.primary }: { rows: readonly BarRow[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,130px)_1fr_auto] items-center gap-3">
          <div className="truncate text-xs text-foreground/80">{r.label}</div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }}
            />
          </div>
          <div className="min-w-[50px] text-right font-mono text-xs font-semibold text-foreground">
            {formatNumber(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DonutChart — segments + center label ─────────────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  center,
  sublabel,
}: {
  segments: readonly DonutSegment[];
  center: string;
  sublabel: string;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const R = 70;
  const r = 48;
  const C = Math.PI * 2 * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="-100 -100 200 200" width="150" height="150" style={{ overflow: "visible" }} role="img" aria-label="Outcome breakdown">
        <circle cx="0" cy="0" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={R - r} />
        {segments.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={i}
              cx="0"
              cy="0"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={R - r}
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="0" y="-2" textAnchor="middle" fontSize="26" fontWeight="700" fill={CHART_COLORS.text}>
          {center}
        </text>
        <text x="0" y="18" textAnchor="middle" fontSize="10" fill={CHART_COLORS.muted}>
          {sublabel}
        </text>
      </svg>
      <div className="flex flex-1 flex-col gap-1.5">
        {segments.map((s, i) => (
          <div key={i} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="text-foreground/80">{s.label}</span>
            <span className="font-mono font-semibold text-foreground">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Heatmap — weeks × 7-day calendar grid ────────────────────────────────────

export function Heatmap({
  cells,
  weeks,
  maxCell,
}: {
  cells: readonly number[];
  weeks: number;
  maxCell: number;
}) {
  const cell = 14;
  const gap = 3;
  const W = weeks * (cell + gap) - gap;
  const H = 7 * (cell + gap) - gap;
  const denom = Math.max(1, maxCell);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: "100%" }} role="img" aria-label="Activity heatmap">
        {cells.map((v, i) => {
          const w = Math.floor(i / 7);
          const d = i % 7;
          const opacity = v === 0 ? 0.07 : 0.25 + (v / denom) * 0.75;
          return (
            <rect
              key={i}
              x={w * (cell + gap)}
              y={d * (cell + gap)}
              width={cell}
              height={cell}
              rx="3"
              fill={CHART_COLORS.primary}
              fillOpacity={opacity}
            />
          );
        })}
      </svg>
      <div className="flex items-center gap-1 pt-0.5 text-[10.5px] text-muted-foreground">
        <span>Less</span>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((o, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: CHART_COLORS.primary, opacity: o }} />
        ))}
        <span>More</span>
      </div>
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
