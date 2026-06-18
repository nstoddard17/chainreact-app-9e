"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsRange, AnalyticsWidget } from "@/contracts/analytics";
import type { NormalizedAnalyticsResult } from "@/services/analytics/sources/types";
import { querySourceData } from "@/lib/api/analytics";
import {
  BarChart,
  CHART_COLORS,
  LineChart,
  formatNumber,
  type BarRow,
} from "@/components/analytics/charts";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Connected-app widget body (Slice ANALYTICS-SOURCES-GITHUB-UI-1).
 *
 * Renders a `connected_app` widget (e.g. GitHub) by fetching the normalized
 * result through the server source route — which resolves the CURRENT VIEWER'S
 * OWN provider connection. So when a co-member opens a shared dashboard, they see
 * THEIR OWN GitHub result (or a connect CTA), never the creator's data. A failed
 * fetch becomes a local state, never a dashboard crash.
 */

type State =
  | { status: "loading" }
  | { status: "ok"; result: NormalizedAnalyticsResult }
  | { status: "missing" }
  | { status: "error"; message: string };

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ConnectedAppWidgetBody({
  widget,
  range,
  reloadKey,
}: {
  widget: AnalyticsWidget;
  range: AnalyticsRange;
  reloadKey: number;
}) {
  const ds = widget.config.dataSource;
  const provider = ds?.kind === "connected_app" ? ds.provider : null;
  const metric = ds?.kind === "connected_app" ? ds.metricKey : null;
  const repo = ds?.kind === "connected_app" ? ds.filters?.repo : undefined;
  const repoStr = typeof repo === "string" ? repo : undefined;

  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!provider || !metric) {
      setState({ status: "error", message: "This widget isn't configured yet." });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    querySourceData({ provider, metric, range, ...(repoStr ? { repo: repoStr } : {}) })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ status: "ok", result: out.result });
        } else if (out.code === "MISSING_CREDENTIAL") {
          setState({ status: "missing" });
        } else {
          setState({ status: "error", message: out.message });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load this data." });
      });
    return () => {
      cancelled = true;
    };
  }, [provider, metric, repoStr, range, reloadKey]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full min-h-[80px] animate-pulse items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-2 text-center">
        <span className="text-primary">
          <AnalyticsIcon name="Webhook" size={20} />
        </span>
        <div className="text-xs font-medium text-foreground">Connect your GitHub account</div>
        <p className="max-w-[220px] text-[11px] text-muted-foreground">
          This widget uses your own GitHub connection. Connect it to see your data.
        </p>
        <Link
          href="/apps"
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          Connect GitHub
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-1 text-center">
        <span className="text-destructive">
          <AnalyticsIcon name="AlertTriangle" size={18} />
        </span>
        <p className="max-w-[240px] text-[11.5px] text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  return <ResultView widget={widget} result={state.result} repo={repoStr} />;
}

function ResultView({
  widget,
  result,
  repo,
}: {
  widget: AnalyticsWidget;
  result: NormalizedAnalyticsResult;
  repo: string | undefined;
}) {
  const stale = result.freshness.stale === true;
  return (
    <div className="flex h-full flex-col gap-2">
      {(stale || result.warnings.length > 0) && (
        <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[10.5px] text-muted-foreground">
          <span className="mt-0.5 flex-shrink-0 text-warning">
            <AnalyticsIcon name="AlertTriangle" size={10} />
          </span>
          <span>{stale ? "Showing recently cached data." : result.warnings[0]}</span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {result.shape === "scalar" ? (
          <ScalarView result={result} />
        ) : widget.type === "bar" ? (
          <SeriesBar result={result} />
        ) : (
          <SeriesLine result={result} />
        )}
      </div>

      <div className="mt-auto truncate text-[10.5px] text-muted-foreground">
        Your GitHub{repo ? ` · ${repo}` : ""}
      </div>
    </div>
  );
}

function scalarValue(result: NormalizedAnalyticsResult): number {
  const measure = result.measures[0];
  if (measure && result.totals && typeof result.totals[measure] === "number") {
    return result.totals[measure];
  }
  const first = result.rows[0];
  const v = measure && first ? first[measure] : null;
  return typeof v === "number" ? v : 0;
}

function ScalarView({ result }: { result: NormalizedAnalyticsResult }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="text-3xl font-bold leading-none tracking-tight text-foreground">
        {formatNumber(scalarValue(result))}
      </div>
    </div>
  );
}

function seriesPoints(result: NormalizedAnalyticsResult): { label: string; value: number }[] {
  const measure = result.measures[0] ?? "count";
  return result.rows.map((row) => {
    const dateVal = row.date;
    const v = row[measure];
    return {
      label: typeof dateVal === "string" ? shortDate(dateVal) : "",
      value: typeof v === "number" ? v : 0,
    };
  });
}

function SeriesLine({ result }: { result: NormalizedAnalyticsResult }) {
  const pts = seriesPoints(result);
  if (pts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No data in this range yet.
      </div>
    );
  }
  return (
    <LineChart
      labels={pts.map((p) => p.label)}
      series={[{ name: "GitHub", data: pts.map((p) => p.value), color: CHART_COLORS.primary }]}
      height={200}
    />
  );
}

function SeriesBar({ result }: { result: NormalizedAnalyticsResult }) {
  const rows: BarRow[] = seriesPoints(result).map((p) => ({ label: p.label, value: p.value }));
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No data in this range yet.
      </div>
    );
  }
  return <BarChart rows={rows} />;
}
