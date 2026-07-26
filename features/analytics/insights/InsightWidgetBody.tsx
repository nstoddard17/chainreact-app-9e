"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AnalyticsWidget, InsightWidgetConfig } from "@/contracts/analytics";
import { InsightWidgetConfigSchema } from "@/contracts/analytics";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { findDataset, findMeasure, findSource, type InsightCatalog } from "./insightCatalog";
import { insightQueryFromConfig } from "./insightQueryFromConfig";
import {
  MAX_EXPLORATION_DEPTH,
  refineInsightConfig,
  suggestedExplorationTitle,
  type InsightDrill,
} from "./insightRefine";
import { useInsightQuery } from "./useInsightQuery";
import { InsightResult } from "./InsightResult";
import { InsightExplorationBar } from "./InsightExplorationBar";
import { InsightFailureView, InsightMessage } from "./InsightStates";

/**
 * Saved Custom Insight widget body (CD-3A; CD-5B added exploration).
 *
 * Renders a persisted `insight` widget by rebuilding its query from the SAME
 * config→query path the preview used and running it through the shared
 * lifecycle hook. Every failure is an isolated local state — one widget can
 * never take down the dashboard. The saved config is re-validated here
 * (schema) and again server-side (catalog) on every query.
 *
 * EXPLORATION (CD-5B) is a bounded, transient, local stack of refined configs
 * on top of the saved root. It stores only validated configs, breadcrumb
 * labels and each level's last successful aggregate (so Back is instant) —
 * never raw records, payloads, cache keys or ids. Nothing is persisted:
 * refreshing the page returns to the saved widget, and the saved config is
 * never modified unless the user explicitly saves a NEW insight.
 */

interface ExplorationEntry {
  config: InsightWidgetConfig;
  crumb: string;
  description: string;
  notes: string[];
}

export function InsightWidgetBody({
  widget,
  catalog,
  connectedProviders,
  canManage,
  reloadKey,
  onResult,
  onSaveExploration,
  saveDisabledReason = null,
}: {
  widget: AnalyticsWidget;
  catalog: InsightCatalog;
  connectedProviders: Record<string, boolean>;
  canManage: boolean;
  /** Dashboard-level "Refresh" — re-runs cache-first (widget refresh bypasses). */
  reloadKey: number;
  /**
   * Reports the currently-rendered result up to the dashboard so the widget
   * header can offer "Export CSV" over exactly what is on screen — no refetch,
   * no second copy of the data (CD-5A). During exploration this is the
   * EXPLORED aggregate, so CSV always exports what the user is looking at.
   */
  onResult?: (widgetId: string, result: ConnectedAnalyticsResult | null) => void;
  /**
   * CD-5B: invoked when an editor saves the explored question as a NEW
   * widget. The dashboard owns dialog + persistence; this hands it only the
   * refined validated config and a suggested title.
   */
  onSaveExploration?: (payload: {
    sourceWidgetId: string;
    config: InsightWidgetConfig;
    suggestedTitle: string;
  }) => void;
  /** Set when saving is temporarily impossible (widget cap) — explains why. */
  saveDisabledReason?: string | null;
}) {
  const parsed = useMemo(
    () =>
      widget.config.insight !== undefined
        ? InsightWidgetConfigSchema.safeParse(widget.config.insight)
        : null,
    [widget.config.insight],
  );
  const savedConfig = parsed?.success ? parsed.data : null;

  // ── Exploration stack (CD-5B) — transient, bounded, root never mutated ────
  const [exploration, setExploration] = useState<ExplorationEntry[]>([]);
  // Each level's last successful aggregate, keyed by its query JSON, so Back
  // renders instantly without waiting on the (server-cached) refetch. Bounded
  // by the depth limit + root; cleared on reset and widget change.
  const resultMemo = useRef(new Map<string, ConnectedAnalyticsResult>());
  useEffect(() => {
    setExploration([]);
    resultMemo.current.clear();
  }, [widget.id, widget.config.insight]);

  const config = exploration.length > 0 ? exploration[exploration.length - 1]!.config : savedConfig;

  const source = findSource(catalog, config?.source ?? null);
  const dataset = findDataset(source, config?.dataset ?? null);
  const measure = findMeasure(dataset, config?.measure ?? null);

  const disconnected =
    source !== null &&
    source.connectionRequired &&
    source.providerId !== null &&
    connectedProviders[source.providerId] !== true;

  const query = useMemo(() => {
    if (!config || !source || !dataset || disconnected) return null;
    return insightQueryFromConfig(config);
  }, [config, source, dataset, disconnected]);
  const queryKey = useMemo(() => (query ? JSON.stringify(query) : null), [query]);

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

  // Remember each level's successful aggregate for instant Back.
  useEffect(() => {
    if (state.status === "ok" && queryKey) {
      resultMemo.current.set(queryKey, state.result);
      // Bounded: root + max depth entries is all Back can ever revisit.
      if (resultMemo.current.size > MAX_EXPLORATION_DEPTH + 1) {
        const first = resultMemo.current.keys().next().value;
        if (first !== undefined) resultMemo.current.delete(first);
      }
    }
  }, [state, queryKey]);
  const memoResult = queryKey ? (resultMemo.current.get(queryKey) ?? null) : null;

  const atDepthLimit = exploration.length >= MAX_EXPLORATION_DEPTH;

  const handleDrill = useCallback(
    (drill: InsightDrill) => {
      if (!config || exploration.length >= MAX_EXPLORATION_DEPTH) return;
      const outcome = refineInsightConfig(catalog, config, drill, Date.now());
      if ("error" in outcome) return; // invalid candidate — nothing is submitted
      setExploration((stack) => [
        ...stack,
        {
          config: outcome.config,
          crumb: outcome.crumb,
          description: outcome.description,
          notes: outcome.notes,
        },
      ]);
    },
    [catalog, config, exploration.length],
  );

  const handleBack = useCallback(() => setExploration((s) => s.slice(0, -1)), []);
  const handleReset = useCallback(() => setExploration([]), []);

  const exploring = exploration.length > 0;
  const activeEntry = exploring ? exploration[exploration.length - 1]! : null;

  // Publish the rendered result upward for the header's Export CSV action. Held
  // in a ref so a parent that re-creates the callback each render can't loop.
  const reportedResult =
    state.status === "ok"
      ? state.result
      : state.status === "loading"
        ? (memoResult ?? state.prior)
        : null;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  useEffect(() => {
    onResultRef.current?.(widget.id, reportedResult);
  }, [widget.id, reportedResult]);
  useEffect(
    () => () => {
      onResultRef.current?.(widget.id, null);
    },
    [widget.id],
  );

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

  const explorationBar = exploring ? (
    <InsightExplorationBar
      rootLabel={`All ${source.label} ${dataset.label.toLowerCase()}`}
      crumbs={exploration.map((e) => ({ label: e.crumb }))}
      description={activeEntry?.description ?? null}
      notes={activeEntry?.notes ?? []}
      atDepthLimit={atDepthLimit}
      canSave={canManage && onSaveExploration !== undefined}
      saveDisabledReason={saveDisabledReason}
      onBack={handleBack}
      onReset={handleReset}
      onSave={() => {
        if (!activeEntry || !onSaveExploration) return;
        onSaveExploration({
          sourceWidgetId: widget.id,
          config: activeEntry.config,
          suggestedTitle: suggestedExplorationTitle(
            dataset.label,
            measure?.label ?? config.measure,
            exploration.map((e) => e.crumb),
          ),
        });
      }}
    />
  ) : null;

  const displayResult =
    state.status === "ok"
      ? state.result
      : state.status === "loading"
        ? (memoResult ?? state.prior)
        : null;

  if (state.status === "error") {
    // A failed exploration keeps Back/Reset available; the parent level's
    // result stays memoized and is restored when the user goes back.
    return (
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        {explorationBar}
        <InsightFailureView
          failure={state.failure}
          sourceLabel={source.label}
          context="widget"
          onRetry={retry}
        />
      </div>
    );
  }

  if (state.status === "idle" || displayResult === null) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        {explorationBar}
        <div className="flex h-full min-h-[80px] animate-pulse items-center justify-center text-xs text-muted-foreground motion-reduce:animate-none">
          Loading…
        </div>
      </div>
    );
  }

  const refreshing = state.status === "loading";
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {explorationBar}
      <div className="min-h-0 flex-1">
        <InsightResult
          result={displayResult}
          chart={config.chart}
          refreshError={state.status === "ok" ? state.refreshError : null}
          onRefresh={dataset.freshness.mode === "cached" ? refresh : undefined}
          refreshing={refreshing}
          onExplore={atDepthLimit ? undefined : handleDrill}
        />
      </div>
    </div>
  );
}
