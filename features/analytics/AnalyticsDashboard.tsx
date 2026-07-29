"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsWidget,
  AnalyticsWidgetConfig,
  AnalyticsWidgetSize,
  AnalyticsWidgetType,
  InsightWidgetConfig,
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
import { exportInsightCsv } from "./insights/exportInsightCsv";
import { isIncompleteResult } from "@/core/analytics/insightCsv";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import type { InsightCatalog } from "./insights/insightCatalog";
import {
  RANGE_OPTIONS,
  MAX_DASHBOARD_WIDGETS,
  makeWidget,
  newWidgetId,
  duplicateWidgetAt,
  ErrorBanner,
  EmptyDashboard,
  downloadDashboardExport,
} from "./dashboardHelpers";
import { AnalyticsExplicitGrid } from "./grid/AnalyticsExplicitGrid";
import { DragOverlayGhost } from "./grid/DragOverlayGhost";
import { useExplicitDragSession } from "./grid/useExplicitDragSession";
import * as edit from "./grid/layoutEditState";
import type { LayoutEditState } from "./grid/layoutEditState";
import { SIZE_OPTIONS } from "./Widget";
import { normalizeDashboardWidgets } from "@/core/analytics/layout";
import { DashboardConfirmDialog, DashboardNameDialog } from "./DashboardDialogs";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";

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

  /**
   * The result each Insight widget currently has on screen, published upward by
   * `InsightWidgetBody` so the header's Export CSV works over exactly what is
   * rendered — never a refetch (CD-5A). Runtime-only; never persisted.
   */
  const [insightResults, setInsightResults] = useState<
    Record<string, ConnectedAnalyticsResult>
  >({});
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const handleInsightResult = useCallback(
    (widgetId: string, result: ConnectedAnalyticsResult | null) => {
      setInsightResults((prev) => {
        if (result === null) {
          if (!(widgetId in prev)) return prev;
          const next = { ...prev };
          delete next[widgetId];
          return next;
        }
        if (prev[widgetId] === result) return prev;
        return { ...prev, [widgetId]: result };
      });
    },
    [],
  );

  const [editing, setEditing] = useState(false);
  /**
   * The explicit edit session (S4). Saved vs working, the layout source, and the
   * rules that decide what a save means all live in `grid/layoutEditState.ts` as
   * pure functions — this component only holds the value and renders it.
   */
  const [session, setSession] = useState<LayoutEditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showLibrary, setShowLibrary] = useState(false);
  // CD-3B dashboard actions — real dialogs, never window.prompt/confirm.
  const [nameDialog, setNameDialog] = useState<"create" | "rename" | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  /** CD-5B: the exploration an editor is saving as a new widget (dialog open). */
  const [savingExploration, setSavingExploration] = useState<{
    sourceWidgetId: string;
    config: InsightWidgetConfig;
    suggestedTitle: string;
  } | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const active = dashboards.find((d) => d.id === activeId) ?? dashboards[0] ?? null;

  /**
   * The committed board's EFFECTIVE layout. A dashboard stored before explicit
   * placement has no coordinates, so they are derived here — deterministically,
   * from order and size, at the canonical four columns. Deriving is not writing:
   * the stored widgets are untouched and stay legacy until the user actually
   * rearranges something.
   */
  const committed = useMemo(
    () => normalizeDashboardWidgets(active?.widgets ?? []),
    [active?.widgets],
  );

  const widgets = editing && session ? session.workingWidgets : committed.widgets;

  /**
   * Explicit drag session (S4). Every preview is `placeWidget` run against the
   * layout snapshotted at drag start, and the drop commits exactly the layout
   * that was previewed — no second algorithm, no array splice.
   */
  const handleDragCommit = useCallback(
    (next: Parameters<typeof edit.commitLayout>[1]) =>
      setSession((s) => (s ? edit.commitLayout(s, next) : s)),
    [],
  );
  const { draggingId, previewLayout, placeholder, overlay, overlayRef, startDrag } =
    useExplicitDragSession({
      gridRef,
      widgets,
      layout: session?.workingLayout ?? committed.effectiveLayout,
      enabled: editing && session !== null,
      onCommit: handleDragCommit,
    });

  /** What the grid draws: the live preview while dragging, else working/saved. */
  const renderedLayout =
    previewLayout ?? (editing && session ? session.workingLayout : committed.effectiveLayout);

  const configuringWidget = configuringId
    ? widgets.find((w) => w.id === configuringId) ?? null
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
    setSession(
      edit.beginEdit(active.widgets, committed.effectiveLayout, committed.layoutSource),
    );
    setEditing(true);
  };

  /** Leave edit mode discarding everything unsaved. */
  const cancelEditing = useCallback(() => {
    setSession(null);
    setEditing(false);
    setConfiguringId(null);
    setActionError(null);
  }, []);

  /**
   * Persist the session. The INTENT is decided by comparing rectangles, not by
   * the fact that an effective layout exists in memory: a legacy board that was
   * only renamed — or dragged and put back — is saved in its legacy shape and
   * stays rollback-safe. A real rearrangement serializes placement for every
   * widget, validated as a whole board before it is sent.
   */
  const doneEditing = useCallback(async () => {
    if (!active || !session) return;
    const payload = edit.buildSavePayload(session);
    if (!payload.ok) {
      setActionError("This arrangement can't be saved. Undo your last change and try again.");
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const updated = await analyticsApi.updateDashboard(active.id, {
        widgets: payload.widgets,
      });
      setDashboards((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
      setSession(null);
      setEditing(false);
      setConfiguringId(null);
    } catch (err) {
      // Stay in edit mode with the working layout intact — a failed request must
      // never look like a successful save, and must never lose the user's work.
      setActionError(err instanceof AnalyticsApiError ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }, [active, session]);

  /** Resize runs through the SAME engine a drag uses; a refusal is shown, not swallowed. */
  const handleResize = (id: string, size: AnalyticsWidgetSize) => {
    setActionError(null);
    setSession((s) => {
      if (!s) return s;
      const outcome = edit.applyWidgetSize(s, id, size);
      if (!outcome.ok) {
        setActionError(outcome.reason);
        return s;
      }
      return outcome.state;
    });
  };
  const handleRemove = (id: string) =>
    setSession((s) => (s ? edit.removeWidget(s, id) : s));
  const handleDuplicate = (id: string) => {
    setActionError(null);
    setSession((s) => {
      if (!s) return s;
      const outcome = duplicateWidgetAt(s.workingWidgets, id);
      if ("error" in outcome) {
        setActionError(outcome.error);
        return s;
      }
      const copy = outcome.widgets.find((w) => w.id === outcome.newId);
      if (!copy) return s;
      const placed = edit.addWidget(s, copy);
      if (!placed.ok) {
        setActionError(placed.reason);
        return s;
      }
      return placed.state;
    });
  };
  const handleRename = (id: string, title: string) =>
    setSession((s) => (s ? edit.updateWidget(s, id, { title }) : s));
  const handleConfigSave = (id: string, config: AnalyticsWidgetConfig) => {
    setSession((s) => (s ? edit.updateWidget(s, id, { config }) : s));
    setConfiguringId(null);
  };
  /**
   * A new widget takes the first open rectangle its footprint fits — scanning
   * top-to-bottom, left-to-right — so it can land in a gap instead of always
   * being appended. The widget and its placement are added together; a widget
   * with no rectangle is state the renderer refuses to draw.
   */
  const handleAdd = (type: AnalyticsWidgetType) => {
    const widget = makeWidget(type);
    setActionError(null);
    setSession((s) => {
      if (!s) return s;
      const placed = edit.addWidget(s, widget);
      if (!placed.ok) {
        setActionError(placed.reason);
        return s;
      }
      return placed.state;
    });
    setShowLibrary(false);
    setConfiguringId(widget.id);
  };
  const switchDashboard = (id: string) => {
    if (editing) return;
    setActiveId(id);
  };

  const createDashboard = async (name: string) => {
    const created = await analyticsApi.createDashboard({ name });
    setDashboards((ds) => [...ds, created]);
    setActiveId(created.id);
    setNameDialog(null);
  };

  /** Rename the active dashboard through the existing PATCH path. */
  const renameDashboard = async (name: string) => {
    if (!active) return;
    const updated = await analyticsApi.updateDashboard(active.id, { name });
    setDashboards((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    setNameDialog(null);
  };

  /**
   * Restore the default board: rewrite the DEFAULT dashboard's widgets to the
   * canonical definitions (contracts/analyticsDefaults.ts) through the same
   * atomic PATCH every save uses. Other dashboards, connections, and account
   * data are untouched.
   */
  const restoreDefaultLayout = async () => {
    if (!active?.isDefault) return;
    const updated = await analyticsApi.updateDashboard(active.id, {
      widgets: DEFAULT_OVERVIEW_WIDGETS,
    });
    setDashboards((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    const restored = normalizeDashboardWidgets(updated.widgets);
    setSession((s) =>
      s
        ? edit.beginEdit(restored.widgets, restored.effectiveLayout, restored.layoutSource)
        : s,
    );
    setShowRestore(false);
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

  /**
   * Per-widget CSV (CD-5A) — serializes the bounded result already on screen.
   * No request is made, so exporting cannot re-query a provider, spend the rate
   * limiter, or touch the snapshot cache. Distinct from `exportDashboard`,
   * which saves the dashboard's CONFIGURATION as JSON.
   */
  const exportWidgetCsv = (id: string) => {
    const result = insightResults[id];
    if (!result) {
      setExportStatus("There's no data to export yet.");
      return;
    }
    const widget = widgets.find((w) => w.id === id);
    try {
      exportInsightCsv(result, widget ? { widgetTitle: widget.title } : {});
      setExportStatus(
        isIncompleteResult(result)
          ? "CSV downloaded. This data is partial or cached — the file records that."
          : "CSV downloaded.",
      );
    } catch {
      setExportStatus("Couldn't create the CSV.");
    }
  };

  /**
   * CD-5B: persist an explored question as a NEW widget, placed immediately
   * after its source widget. Distinct from Duplicate (which copies the saved
   * question): this saves the currently-explored refinement. The source
   * widget's config is never touched.
   *
   * In edit mode the widget joins the draft (persisted by the normal atomic
   * "Done editing" PATCH); outside edit mode it PATCHes immediately, the same
   * pattern as Restore-default-layout.
   */
  const atWidgetCap = widgets.length >= MAX_DASHBOARD_WIDGETS;
  const saveExploration = async (title: string) => {
    if (!savingExploration || !active) return;
    const buildWidget = (list: readonly AnalyticsWidget[]): AnalyticsWidget => {
      const next = list.slice();
      const widgetToAdd: AnalyticsWidget = {
        id: newWidgetId(),
        type: "insight",
        size:
          (next.find((w) => w.id === savingExploration.sourceWidgetId)?.size as
            | AnalyticsWidgetSize
            | undefined) ?? "m",
        title: title.slice(0, 120),
        icon: "Sparkle",
        config: { source: "any", insight: savingExploration.config },
      };
      return widgetToAdd;
    };
    if (editing && session) {
      if (session.workingWidgets.length >= MAX_DASHBOARD_WIDGETS) {
        throw new Error(`A dashboard can hold up to ${MAX_DASHBOARD_WIDGETS} widgets.`);
      }
      const placed = edit.addWidget(session, buildWidget(session.workingWidgets));
      if (!placed.ok) throw new Error(placed.reason);
      setSession(placed.state);
      setSavingExploration(null);
      return;
    }
    if (active.widgets.length >= MAX_DASHBOARD_WIDGETS) {
      throw new Error(`A dashboard can hold up to ${MAX_DASHBOARD_WIDGETS} widgets.`);
    }
    const updated = await analyticsApi.updateDashboard(active.id, {
      widgets: [...active.widgets, buildWidget(active.widgets)],
    });
    setDashboards((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    setSavingExploration(null);
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
          {canManage && editing && (
            <button
              type="button"
              data-testid="analytics-cancel-editing"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-foreground/80 hover:border-foreground/25 hover:text-foreground disabled:opacity-60"
              onClick={cancelEditing}
              disabled={saving}
              title="Discard your unsaved changes"
            >
              <AnalyticsIcon name="X" size={11} /> Cancel
            </button>
          )}
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
        {canManage && active && !editing && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setNameDialog("rename")}
          >
            <AnalyticsIcon name="Settings" size={11} /> Rename
          </button>
        )}
        {canManage && active?.isDefault && !editing && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowRestore(true)}
          >
            <AnalyticsIcon name="History" size={11} /> Restore default layout
          </button>
        )}
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
            onClick={() => setNameDialog("create")}
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
              <strong className="font-semibold text-foreground">Edit mode is on.</strong> Drag a widget by its grip to
              reorder, resize with the dropdown, rename by clicking a title, or add a widget. Nothing&apos;s saved until
              you click Done editing.
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

      {/* Export outcome — announced, never an alert() and never silent. */}
      <div aria-live="polite" role="status" className="sr-only">
        {exportStatus ?? ""}
      </div>

      {/* Grid */}
      {widgets.length === 0 ? (
        <EmptyDashboard
          editing={editing}
          canManage={canManage}
          onAdd={() => setShowLibrary(true)}
          onEdit={startEditing}
        />
      ) : (
        <div ref={gridRef}>
          <AnalyticsExplicitGrid
            widgets={widgets}
            layout={renderedLayout}
            {...(editing && placeholder
              ? { placeholder: { ...placeholder, ...(draggingId ? { widgetId: draggingId } : {}) } }
              : {})}
            renderWidget={(w: AnalyticsWidget) => (
              <Widget
                widget={w}
                isEditing={editing}
                isDragSource={draggingId === w.id}
                {...(rangeLabel && w.type !== "insight" ? { rangeLabel } : {})}
                onResize={handleResize}
                {...(editing && session
                  ? {
                      allowedSizes: edit.allowedSizesAt(
                        session.workingLayout,
                        w.id,
                        SIZE_OPTIONS.map((o) => o.id),
                      ),
                    }
                  : {})}
                onDuplicate={handleDuplicate}
                onRemove={handleRemove}
                onRename={handleRename}
                onConfigure={(id) => setConfiguringId(id)}
                onDragHandleDown={startDrag}
                {...(w.type === "insight" && insightResults[w.id]
                  ? { onExportCsv: exportWidgetCsv }
                  : {})}
              >
                {w.type === "insight" ? (
                  <InsightWidgetBody
                    widget={w}
                    catalog={insightCatalog}
                    connectedProviders={connectedProviders}
                    canManage={canManage}
                    reloadKey={reloadKey}
                    onResult={handleInsightResult}
                    {...(canManage ? { onSaveExploration: setSavingExploration } : {})}
                    saveDisabledReason={
                      atWidgetCap
                        ? `This dashboard is full (${MAX_DASHBOARD_WIDGETS} widgets) — remove one to save a new insight.`
                        : null
                    }
                  />
                ) : widgetSourceKind(w.config) === "connected_app" ? (
                  <ConnectedAppWidgetBody widget={w} range={range} reloadKey={reloadKey} />
                ) : (
                  <WidgetBody overview={loadingData ? null : overview} widget={w} />
                )}
              </Widget>
            )}
          />
          {editing && (
            <button
              type="button"
              className="mt-3.5 flex min-h-[190px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/40 p-6 text-sm text-muted-foreground hover:border-primary hover:text-primary sm:w-1/2 lg:w-1/4"
              onClick={() => setShowLibrary(true)}
            >
              <AnalyticsIcon name="Plus" size={18} />
              <span>Add a widget</span>
            </button>
          )}
        </div>
      )}

      {/* The held card, following the pointer outside the grid's flow. */}
      {overlay && <DragOverlayGhost overlay={overlay} overlayRef={overlayRef} />}

      {nameDialog && (
        <DashboardNameDialog
          mode={nameDialog}
          {...(nameDialog === "rename" && active ? { initialName: active.name } : {})}
          onSubmit={nameDialog === "rename" ? renameDashboard : createDashboard}
          onClose={() => setNameDialog(null)}
        />
      )}
      {savingExploration && (
        <DashboardNameDialog
          mode="saveInsight"
          initialName={savingExploration.suggestedTitle}
          onSubmit={saveExploration}
          onClose={() => setSavingExploration(null)}
        />
      )}
      {showRestore && active?.isDefault && (
        <DashboardConfirmDialog
          title="Restore the default layout?"
          body={`This replaces the widgets on "${active.name}" with ChainReact's default set. Any widgets you added or configured here will be removed. Your other dashboards and your data aren't affected.`}
          confirmLabel="Restore layout"
          destructive
          onConfirm={restoreDefaultLayout}
          onClose={() => setShowRestore(false)}
        />
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
