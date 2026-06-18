"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsRange, AnalyticsWidget } from "@/contracts/analytics";
import type { NormalizedAnalyticsResult } from "@/services/analytics/sources/types";
import { querySourceData } from "@/lib/api/analytics";
import {
  getConnectedAppSource,
  type ConnectedAppSourceUi,
} from "./connectedAppSources";
import {
  BarChart,
  CHART_COLORS,
  LineChart,
  formatNumber,
  type BarRow,
} from "@/components/analytics/charts";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Connected-app widget body (Slice ANALYTICS-SOURCES-GITHUB-UI-1; generalized for
 * Slack in ANALYTICS-SOURCES-SLACK-UI-1).
 *
 * Renders a `connected_app` widget by fetching the normalized result through the
 * server source route. Copy + attribution come from the provider's descriptor:
 *   - ACCOUNT-shared providers (Slack) resolve the account's connection — every
 *     member sees the same workspace data.
 *   - PERSONAL providers (GitHub) resolve the CURRENT VIEWER'S own connection — a
 *     co-member sees THEIR OWN result or a connect CTA, never the creator's data.
 * A failed fetch becomes a local state, never a dashboard crash.
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

/** String-only filters from the widget config (the route allow-lists the keys). */
function stringFilters(
  filters: Readonly<Record<string, string | number | boolean>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
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
  const filters = ds?.kind === "connected_app" ? stringFilters(ds.filters) : {};
  const filtersKey = JSON.stringify(filters);
  const descriptor = provider ? getConnectedAppSource(provider) : null;

  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!provider || !metric) {
      setState({ status: "error", message: "This widget isn't configured yet." });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    querySourceData({ provider, metric, range, filters })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, metric, filtersKey, range, reloadKey]);

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
          <AnalyticsIcon name={descriptor?.icon ?? "Webhook"} size={20} />
        </span>
        <div className="text-xs font-medium text-foreground">
          {descriptor?.connectTitle ?? "Connect this app"}
        </div>
        <p className="max-w-[220px] text-[11px] text-muted-foreground">
          {descriptor?.connectHelp ?? "Connect it to see your data."}
        </p>
        <Link
          href={descriptor?.connectHref ?? "/apps"}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          {descriptor?.connectCtaLabel ?? "Connect"}
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

  return (
    <ResultView
      widget={widget}
      result={state.result}
      descriptor={descriptor}
      repo={filters.repo}
    />
  );
}

function ResultView({
  widget,
  result,
  descriptor,
  repo,
}: {
  widget: AnalyticsWidget;
  result: NormalizedAnalyticsResult;
  descriptor: ConnectedAppSourceUi | null;
  repo: string | undefined;
}) {
  const stale = result.freshness.stale === true;
  // Attribution: descriptor prefix, plus the repo for GitHub (the channel id is
  // opaque, so account providers show the prefix only).
  const prefix = descriptor?.attributionPrefix ?? "Connected app";
  const attribution = repo ? `${prefix} · ${repo}` : prefix;
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
          <SeriesLine result={result} name={descriptor?.displayName ?? "Series"} />
        )}
      </div>

      <div className="mt-auto truncate text-[10.5px] text-muted-foreground">{attribution}</div>
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

function SeriesLine({ result, name }: { result: NormalizedAnalyticsResult; name: string }) {
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
      series={[{ name, data: pts.map((p) => p.value), color: CHART_COLORS.primary }]}
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
