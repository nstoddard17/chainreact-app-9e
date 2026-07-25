"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsWidget,
  AnalyticsWidgetConfig,
  AnalyticsWidgetSize,
  AnalyticsWidgetType,
} from "@/contracts/analytics";
import { widgetSourceKind } from "@/contracts/analytics";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsApiError } from "@/lib/api/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { Widget } from "./Widget";
import { WidgetBody } from "./widgetBodies";
import { ConnectedAppWidgetBody } from "./ConnectedAppWidgetBody";
import { WidgetLibrary } from "./WidgetLibrary";
import { WidgetConfigPanel } from "./WidgetConfigPanel";
import { InsightConfigPanel } from "./insights/InsightConfigPanel";
import { InsightWidgetBody } from "./insights/InsightWidgetBody";
import type { InsightCatalog } from "./insights/insightCatalog";
import {
  RANGE_OPTIONS,
  makeWidget,
  ErrorBanner,
  EmptyDashboard,
  downloadDashboardExport,
} from "./dashboardHelpers";

/**
 * Analytics dashboard orchestrator (Slice ANALYTICS-1).
 *
 * Owns: the active range (refetches real account-scoped data), the saved-
 * dashboard tabs (create / switch / delete via the real API), and edit mode
 * (drag-reorder, resize, rename, add, remove, per-widget config). Edits are
 * local until "Done editing", which persists the whole widget layout in one
 * atomic PATCH — matching the product model.
 *
 * Every value rendered comes from real account-scoped aggregates; there are no
 * fake controls (Share / scheduled refresh / filters are deferred, documented).
 */

interface Props {
  accountName: string;
  /**
   * Whether the viewer may author dashboards (owner/admin; personal owner). When
   * false (a team/business/org member), edit/create/delete controls are hidden —
   * reads, range, refresh, and export stay available. The server routes enforce
   * this regardless; this only governs control visibility.
   */
  canManage: boolean;
  /**
   * Connection status per EXPOSED connected-app provider (drives the config
   * panel's connect note). Account-shared providers reflect the account's
   * connection; personal providers reflect this viewer's own.
   */
  connectedProviders: Record<string, boolean>;
  /**
   * Client-safe Custom Insight catalog, already filtered server-side to this
   * environment's exposure (production never receives preview sources).
   */
  insightCatalog: InsightCatalog;
  initialDashboards: readonly Dashboard[];
  initialOverview: AnalyticsOverview;
  initialRange: AnalyticsRange;
}

export function AnalyticsDashboard({
  accountName,
  canManage,
  connectedProviders,
  insightCatalog,
  initialDashboards,
  initialOverview,
  initialRange,
}: Props) {
  const [dashboards, setDashboards] = useState<readonly Dashboard[]>(initialDashboards);
  const [activeId, setActiveId] = useState<string>(initialDashboards[0]?.id ?? "");
  const [range, setRange] = useState<AnalyticsRange>(initialRange);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(initialOverview);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState<readonly AnalyticsWidget[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showLibrary, setShowLibrary] = useState(false);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const draggingId = useRef<string | null>(null);
  const [draggingState, setDraggingState] = useState<string | null>(null);

  const active = dashboards.find((d) => d.id === activeId) ?? dashboards[0] ?? null;
  const widgets = editing ? draftWidgets : (active?.widgets ?? []);
  const configuringWidget = configuringId
    ? (editing ? draftWidgets : widgets).find((w) => w.id === configuringId) ?? null
    : null;

  // Refetch real data whenever the range changes (initial range is server-fetched).
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    setDataError(null);
    analyticsApi
      .getAnalyticsData(range)
      .then((o) => {
        if (!cancelled) setOverview(o);
      })
      .catch((err) => {
        if (!cancelled) {
          setDataError(err instanceof AnalyticsApiError ? err.message : "Couldn't load analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey]);

  const reloadData = useCallback(() => setReloadKey((k) => k + 1), []);

  const startEditing = () => {
    if (!active || !canManage) return;
    setDraftWidgets(active.widgets.map((w) => ({ ...w })));
    setEditing(true);
  };

  const doneEditing = useCallback(async () => {
    if (!active) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await analyticsApi.updateDashboard(active.id, { widgets: draftWidgets });
      setDashboards((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
      setEditing(false);
      setConfiguringId(null);
    } catch (err) {
      setActionError(err instanceof AnalyticsApiError ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }, [active, draftWidgets]);

  const handleResize = (id: string, size: AnalyticsWidgetSize) =>
    setDraftWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, size } : w)));
  const handleRemove = (id: string) =>
    setDraftWidgets((ws) => ws.filter((w) => w.id !== id));
  const handleRename = (id: string, title: string) =>
    setDraftWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, title } : w)));
  const handleConfigSave = (id: string, config: AnalyticsWidgetConfig) => {
    setDraftWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, config } : w)));
    setConfiguringId(null);
  };
  const handleAdd = (type: AnalyticsWidgetType) => {
    const widget = makeWidget(type);
    setDraftWidgets((ws) => [...ws, widget]);
    setShowLibrary(false);
    setConfiguringId(widget.id);
  };
  const handleMove = (phase: "start" | "end" | "drop", id: string) => {
    if (phase === "start") {
      draggingId.current = id;
      setDraggingState(id);
    } else if (phase === "end") {
      draggingId.current = null;
      setDraggingState(null);
    } else if (phase === "drop") {
      const from = draggingId.current;
      draggingId.current = null;
      setDraggingState(null);
      if (!from || from === id) return;
      setDraftWidgets((ws) => {
        const fromIdx = ws.findIndex((w) => w.id === from);
        const toIdx = ws.findIndex((w) => w.id === id);
        if (fromIdx < 0 || toIdx < 0) return ws;
        const next = ws.slice();
        const [moved] = next.splice(fromIdx, 1);
        if (moved) next.splice(toIdx, 0, moved);
        return next;
      });
    }
  };

  const switchDashboard = (id: string) => {
    if (editing) return;
    setActiveId(id);
  };

  const createDashboard = async () => {
    const name = window.prompt("Name your new dashboard")?.trim();
    if (!name) return;
    setActionError(null);
    try {
      const created = await analyticsApi.createDashboard({ name });
      setDashboards((ds) => [...ds, created]);
      setActiveId(created.id);
    } catch (err) {
      setActionError(err instanceof AnalyticsApiError ? err.message : "Couldn't create the dashboard.");
    }
  };

  const deleteActiveDashboard = async () => {
    if (!active || active.isDefault) return;
    if (!window.confirm(`Delete "${active.name}"? This can't be undone.`)) return;
    setActionError(null);
    try {
      await analyticsApi.deleteDashboard(active.id);
      setDashboards((ds) => {
        const next = ds.filter((d) => d.id !== active.id);
        setActiveId(next[0]?.id ?? "");
        return next;
      });
    } catch (err) {
      setActionError(err instanceof AnalyticsApiError ? err.message : "Couldn't delete the dashboard.");
    }
  };

  const exportDashboard = () => {
    if (active) downloadDashboardExport(active, range, overview);
  };

  const rangeLabel = RANGE_OPTIONS.find((r) => r.id === range)?.label;

  return (
    <main className="flex w-full flex-col px-6 pb-16 pt-7 sm:px-9">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-primary">
              <AnalyticsIcon name="Cube" size={12} />
            </span>
            <span>{accountName}</span>
            <span className="text-muted-foreground/60">›</span>
            <span className="font-medium text-foreground">Analytics</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">How everything's going</h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] text-muted-foreground">
            {canManage
              ? "Your account's automations at a glance. Drag, resize, rename, or add widgets in edit mode."
              : "Your account's automations at a glance."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex gap-px rounded-lg border border-border bg-card p-[3px]">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={
                  "rounded-md px-2.5 py-1.5 text-xs " +
                  (range === r.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
                onClick={() => setRange(r.id)}
                disabled={loadingData && range === r.id}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground/80 hover:border-foreground/25 hover:text-foreground disabled:opacity-60"
            onClick={reloadData}
            disabled={loadingData}
            title="Pull the latest data"
          >
            <AnalyticsIcon name="History" size={11} /> {loadingData ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground/80 hover:border-foreground/25 hover:text-foreground"
            onClick={exportDashboard}
            title="Download this dashboard + its data as JSON"
          >
            <AnalyticsIcon name="Code" size={11} /> Export
          </button>
          {canManage && (
            <button
              type="button"
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold " +
                (editing
                  ? "border-success bg-success text-success-foreground"
                  : "border-primary bg-primary text-primary-foreground") +
                " hover:brightness-105 disabled:opacity-60"
              }
              onClick={() => (editing ? void doneEditing() : startEditing())}
              disabled={saving || !active}
            >
              {editing ? (
                <>
                  <AnalyticsIcon name="Check" size={11} /> {saving ? "Saving…" : "Done editing"}
                </>
              ) : (
                <>
                  <AnalyticsIcon name="Settings" size={11} /> Edit dashboard
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Saved-dashboard tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-border bg-card p-1">
        {dashboards.map((d) => {
          const on = d.id === activeId;
          return (
            <button
              key={d.id}
              type="button"
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] disabled:opacity-60 " +
                (on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")
              }
              onClick={() => switchDashboard(d.id)}
              disabled={editing && !on}
            >
              <AnalyticsIcon name={d.isDefault ? "Bolt" : "CircleDot"} size={11} />
              <span>{d.name}</span>
              <span
                className={
                  "rounded-full border px-1.5 py-px font-mono text-[10px] font-semibold " +
                  (on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground")
                }
              >
                {d.widgets.length}
              </span>
            </button>
          );
        })}
        <span className="flex-1" />
        {canManage && active && !active.isDefault && !editing && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => void deleteActiveDashboard()}
          >
            <AnalyticsIcon name="X" size={11} /> Delete
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            onClick={() => void createDashboard()}
            disabled={editing}
          >
            <AnalyticsIcon name="Plus" size={11} /> New dashboard
          </button>
        )}
      </div>

      {/* Edit banner */}
      {editing && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-dashed border-primary/40 bg-primary/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5 text-[13px] text-foreground/80">
            <span className="text-primary">
              <AnalyticsIcon name="Sparkle" size={13} />
            </span>
            <span>
              <strong className="font-semibold text-foreground">Edit mode is on.</strong> Drag to reorder, resize with
              the dropdown, rename by clicking a title, or add a widget. Nothing's saved until you click Done editing.
            </span>
          </div>
          <button
            type="button"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105"
            onClick={() => setShowLibrary(true)}
          >
            <AnalyticsIcon name="Plus" size={11} /> Add a widget
          </button>
        </div>
      )}

      {/* Error banners */}
      {dataError && <ErrorBanner message={dataError} onRetry={reloadData} retryLabel="Retry" />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      {/* Grid */}
      {widgets.length === 0 ? (
        <EmptyDashboard
          editing={editing}
          canManage={canManage}
          onAdd={() => setShowLibrary(true)}
          onEdit={startEditing}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [grid-auto-rows:minmax(190px,auto)]">
          {widgets.map((w) => (
            <Widget
              key={w.id}
              widget={w}
              isEditing={editing}
              isDragging={draggingState === w.id}
              {...(rangeLabel && w.type !== "insight" ? { rangeLabel } : {})}
              onResize={handleResize}
              onRemove={handleRemove}
              onRename={handleRename}
              onConfigure={(id) => setConfiguringId(id)}
              onMove={handleMove}
            >
              {w.type === "insight" ? (
                <InsightWidgetBody
                  widget={w}
                  catalog={insightCatalog}
                  connectedProviders={connectedProviders}
                  canManage={canManage}
                  reloadKey={reloadKey}
                />
              ) : widgetSourceKind(w.config) === "connected_app" ? (
                <ConnectedAppWidgetBody widget={w} range={range} reloadKey={reloadKey} />
              ) : (
                <WidgetBody overview={loadingData ? null : overview} widget={w} />
              )}
            </Widget>
          ))}
          {editing && (
            <button
              type="button"
              className="col-span-1 flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/40 p-6 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              onClick={() => setShowLibrary(true)}
            >
              <AnalyticsIcon name="Plus" size={18} />
              <span>Add a widget</span>
            </button>
          )}
        </div>
      )}

      {showLibrary && <WidgetLibrary onAdd={handleAdd} onClose={() => setShowLibrary(false)} />}
      {configuringWidget &&
        (configuringWidget.type === "insight" ? (
          <InsightConfigPanel
            widget={configuringWidget}
            catalog={insightCatalog}
            connectedProviders={connectedProviders}
            internalEntityOptions={(overview?.workflows ?? []).map((wf) => ({
              value: wf.workflowId,
              label: wf.name,
            }))}
            onClose={() => setConfiguringId(null)}
            onSave={(config) => handleConfigSave(configuringWidget.id, config)}
          />
        ) : (
          <WidgetConfigPanel
            widget={configuringWidget}
            workflows={overview?.workflows ?? []}
            connectedProviders={connectedProviders}
            onClose={() => setConfiguringId(null)}
            onSave={(config) => handleConfigSave(configuringWidget.id, config)}
          />
        ))}
    </main>
  );
}
