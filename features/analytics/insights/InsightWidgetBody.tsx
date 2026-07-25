"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { AnalyticsWidget } from "@/contracts/analytics";
import { InsightWidgetConfigSchema } from "@/contracts/analytics";
import { findDataset, findSource, type InsightCatalog } from "./insightCatalog";
import { insightQueryFromConfig } from "./insightQueryFromConfig";
import { useInsightQuery } from "./useInsightQuery";
import { InsightResult } from "./InsightResult";
import { InsightFailureView, InsightMessage } from "./InsightStates";

/**
 * Saved Custom Insight widget body (CD-3A).
 *
 * Renders a persisted `insight` widget by rebuilding its query from the SAME
 * config→query path the preview used and running it through the shared
 * lifecycle hook. Every failure is an isolated local state — one widget can
 * never take down the dashboard. The saved config is re-validated here
 * (schema) and again server-side (catalog) on every query.
 */
export function InsightWidgetBody({
  widget,
  catalog,
  connectedProviders,
  canManage,
  reloadKey,
}: {
  widget: AnalyticsWidget;
  catalog: InsightCatalog;
  connectedProviders: Record<string, boolean>;
  canManage: boolean;
  /** Dashboard-level "Refresh" — re-runs cache-first (widget refresh bypasses). */
  reloadKey: number;
}) {
  const parsed = useMemo(
    () =>
      widget.config.insight !== undefined
        ? InsightWidgetConfigSchema.safeParse(widget.config.insight)
        : null,
    [widget.config.insight],
  );
  const config = parsed?.success ? parsed.data : null;

  const source = findSource(catalog, config?.source ?? null);
  const dataset = findDataset(source, config?.dataset ?? null);

  const disconnected =
    source !== null &&
    source.connectionRequired &&
    source.providerId !== null &&
    connectedProviders[source.providerId] !== true;

  const query = useMemo(() => {
    if (!config || !source || !dataset || disconnected) return null;
    return insightQueryFromConfig(config);
  }, [config, source, dataset, disconnected]);

  const { state, refresh, retry } = useInsightQuery(query);

  // Dashboard-level Refresh: re-run cache-first (matches internal widgets'
  // "pull latest" without hammering provider limits).
  const lastReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== lastReloadKey.current) {
      lastReloadKey.current = reloadKey;
      retry();
    }
  }, [reloadKey, retry]);

  if (widget.config.insight === undefined) {
    return (
      <InsightMessage
        icon="Sparkle"
        title="Finish setting up this insight"
        body={
          canManage
            ? "Open Edit dashboard and configure it to choose where its data comes from."
            : "An account owner or admin can configure this widget."
        }
      />
    );
  }

  if (!config || !source || !dataset) {
    // Malformed or catalog-obsolete saved config — isolated safe state.
    return (
      <InsightMessage
        icon="AlertTriangle"
        tone="warning"
        title="Settings need an update"
        body="This insight uses settings that are no longer available. Edit the widget to update it."
      />
    );
  }

  if (disconnected) {
    return (
      <InsightMessage
        icon="Webhook"
        title={`Connect ${source.label}`}
        body={`Connect ${source.label} to see this data in Analytics.`}
      >
        <Link
          href="/apps"
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          Connect {source.label}
        </Link>
      </InsightMessage>
    );
  }

  if (state.status === "idle" || (state.status === "loading" && state.prior === null)) {
    return (
      <div className="flex h-full min-h-[80px] animate-pulse items-center justify-center text-xs text-muted-foreground motion-reduce:animate-none">
        Loading…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <InsightFailureView
        failure={state.failure}
        sourceLabel={source.label}
        context="widget"
        onRetry={retry}
      />
    );
  }

  const result = state.status === "ok" ? state.result : state.prior!;
  const refreshing = state.status === "loading";
  return (
    <InsightResult
      result={result}
      refreshError={state.status === "ok" ? state.refreshError : null}
      onRefresh={dataset.freshness.mode === "cached" ? refresh : undefined}
      refreshing={refreshing}
    />
  );
}
