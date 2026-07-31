"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowRunSummary } from "@/contracts/workflow";
import { listWorkflowRuns } from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { RunDetailPane } from "./RunDetail";
import {
  messageFrom,
  metaLine,
  SOURCE_LABEL,
  StatusBadge,
  LiveTestTag,
  TestTag,
  type RowStatus,
} from "./runsPanelParts";

/**
 * Slice 4.BUILDER-RUNS-TAB-1 — the builder's workflow-scoped Runs tab.
 *
 * Product split (do not blur these):
 *   - Runs tab        → execution history for THIS workflow (here).
 *   - Undo / Redo     → edit history (separate system).
 *   - React Agent rail→ setup guidance (separate system).
 *   - Dashboard /runs → account-wide history (separate page).
 *
 * Reuses existing surfaces only — it adds no backend route:
 *   - `listWorkflowRuns(workflowId)` / `getWorkflowRun(workflowId, runId)`
 *     (both membership-gated + sanitized server-side; the DTOs never carry raw
 *     trigger payloads, tokens, credential ids, or raw provider error bodies).
 *   - The live in-flight run is read from `runSlice` (the 1s poller that
 *     `WorkflowBuilder` already installs) so a just-started run shows as
 *     "Running" without inventing a new realtime system.
 *   - `configSlice.revealNode` powers "Open failed step".
 *   - `useRunControls().handleTestWorkflow` powers a SAFE "Run again"
 *     (test mode → external/destructive handlers skipped, no draft mutation,
 *     no save/activate/publish).
 *
 * Deliberately conservative on output: per-step OUTPUT is never rendered here
 * (history/debugging only needs status + the humanized error). That keeps the
 * tab free of any payload-shaped surface by construction.
 */

interface RunsPanelProps {
  /**
   * Called when the user clicks "Open failed step". The canvas reveal
   * (pan/zoom) only lands while the Builder tab is mounted, so the parent
   * switches `activeTab` back to "builder". Opening the node's config rail
   * itself happens via `configSlice.revealNode` regardless.
   */
  onOpenFailedStep?: () => void;
  /**
   * WF-RUNPERM — true when the viewer may NOT run/edit this workflow (private
   * credential). Mirrors the header: when set, "Run again" is hidden (the
   * run-now route enforces the same policy with a typed 403 anyway).
   */
  runEditBlocked?: boolean;
}

export function RunsPanel({ onOpenFailedStep, runEditBlocked }: RunsPanelProps = {}) {
  const workflowId = useGraphSlice((s) => s.workflowId);

  // Live in-flight run (reuses the existing latest-run poller in runSlice).
  const liveStatus = useRunSlice((s) => s.status);
  const liveRunId = useRunSlice((s) => s.runId);

  const [runs, setRuns] = useState<readonly WorkflowRunSummary[]>([]);
  const [listState, setListState] = useState<"loading" | "loaded" | "error">("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // Presentation only: which surface is on screen when there is not room for
  // both. It never decides WHICH run is selected — `selectedRunId` does, in
  // both presentations — so the two can never disagree, and it is ignored from
  // `lg` up where the split view renders both.
  const [narrowView, setNarrowView] = useState<"list" | "detail">("list");

  const loadRuns = useCallback(async () => {
    if (!workflowId) return;
    setListState("loading");
    setListError(null);
    try {
      const result = await listWorkflowRuns(workflowId);
      // Newest-first — defensive sort so ordering doesn't depend on row order.
      const sorted = [...result].sort(
        (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
      );
      setRuns(sorted);
      setListState("loaded");
    } catch (err) {
      setListError(messageFrom(err, "Couldn't load runs."));
      setListState("error");
    }
  }, [workflowId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // When the live run reaches a terminal state, refresh once so the now-
  // persisted row joins the history list (and the synthetic "Running" row drops).
  const prevLive = useRef(liveStatus);
  useEffect(() => {
    const was = prevLive.current;
    prevLive.current = liveStatus;
    if ((liveStatus === "succeeded" || liveStatus === "failed") && was !== liveStatus) {
      void loadRuns();
    }
  }, [liveStatus, loadRuns]);

  // Default-select the newest run once the list loads (never the live row).
  useEffect(() => {
    if (selectedRunId !== null) return;
    if (runs.length > 0) setSelectedRunId(runs[0]!.id);
  }, [runs, selectedRunId]);

  const liveRunVisible =
    liveRunId !== null &&
    liveStatus === "pending" &&
    !runs.some((r) => r.id === liveRunId);

  const isEmpty = listState === "loaded" && runs.length === 0 && !liveRunVisible;

  return (
    <div
      data-testid="builder-runs-tab"
      data-no-pan-below="1600"
      className="absolute inset-0 z-10 flex flex-col overflow-hidden"
      style={{ background: "var(--builder-bg)" }}
    >
      <header
        className="flex items-center justify-between gap-2 border-b px-4 py-2.5"
        style={{ borderColor: "var(--builder-border)" }}
      >
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--builder-text)" }}>
          Runs
        </h2>
        <button
          type="button"
          onClick={() => void loadRuns()}
          disabled={listState === "loading"}
          data-testid="runs-refresh"
          className="rounded-[6px] border px-2.5 py-1 text-[12px] disabled:opacity-50"
          style={{
            borderColor: "var(--builder-border)",
            background: "var(--builder-panel)",
            color: "var(--builder-text)",
          }}
        >
          {listState === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {listState === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p role="alert" className="text-[12.5px] text-destructive">
            {listError}
          </p>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="rounded-[6px] border px-2.5 py-1 text-[12px]"
            style={{ borderColor: "var(--builder-border)", color: "var(--builder-text)" }}
          >
            Retry
          </button>
        </div>
      ) : isEmpty ? (
        <div
          className="flex flex-1 items-center justify-center p-6 text-center"
          data-testid="runs-empty-state"
        >
          <p className="max-w-[340px] text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            Run this workflow to see execution history here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          {/*
            RESPONSIVE-BUILDER-RUNS-6 — ONE SURFACE AT A TIME below `lg`.

            This was a permanent two-column split at every width: a `w-[300px]
            shrink-0` history nav beside the detail. At 360px the nav alone took
            300px and left the detail about 60px — the run you selected was
            effectively invisible. That matches the builder's own accepted
            responsive model, which already says narrow means one surface at a
            time; the Runs tab simply never adopted it.

            Both children stay MOUNTED in both presentations and visibility is all
            that changes. That is deliberate: unmounting the detail on resize
            would refetch the run and lose the loaded detail, and unmounting the
            list would lose its scroll position. `selectedRunId` remains the
            single source of truth for WHICH run is shown — `narrowView` only
            decides which surface is on screen when there isn't room for both, and
            it is ignored entirely from `lg` up.
          */}
          <div
            data-testid="runs-list-surface"
            className={
              "flex min-h-0 min-w-0 lg:flex " +
              (narrowView === "detail" ? "hidden" : "flex-1 lg:flex-none")
            }
          >
            <RunList
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={(id) => {
                setSelectedRunId(id);
                setNarrowView("detail");
              }}
              liveRunVisible={liveRunVisible}
              liveRunId={liveRunId}
              loading={listState === "loading"}
            />
          </div>
          <div
            data-testid="runs-detail-surface"
            className={
              "min-h-0 min-w-0 flex-1 lg:flex " +
              (narrowView === "list" ? "hidden" : "flex")
            }
          >
            <RunDetailPane
              workflowId={workflowId}
              selectedRunId={selectedRunId}
              isLiveSelection={liveRunVisible && selectedRunId === liveRunId}
              {...(onOpenFailedStep ? { onOpenFailedStep } : {})}
              runEditBlocked={runEditBlocked ?? false}
              onBackToList={() => setNarrowView("list")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RunList({
  runs,
  selectedRunId,
  onSelect,
  liveRunVisible,
  liveRunId,
  loading,
}: {
  runs: readonly WorkflowRunSummary[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
  liveRunVisible: boolean;
  liveRunId: string | null;
  loading: boolean;
}) {
  return (
    <nav
      aria-label="Recent runs"
      data-testid="runs-nav"
      data-no-pan-below="1600"
      className="flex w-full min-w-0 flex-col gap-1 overflow-y-auto border-r p-2 lg:w-[300px] lg:shrink-0"
      style={{ borderColor: "var(--builder-border)" }}
    >
      {liveRunVisible && liveRunId ? (
        <RunListRow
          key={liveRunId}
          kind="running"
          runId={liveRunId}
          selected={selectedRunId === liveRunId}
          onSelect={() => onSelect(liveRunId)}
        />
      ) : null}
      {runs.map((run) => (
        <RunListRow
          key={run.id}
          kind="terminal"
          run={run}
          runId={run.id}
          selected={selectedRunId === run.id}
          onSelect={() => onSelect(run.id)}
        />
      ))}
      {loading && runs.length === 0 && !liveRunVisible ? (
        <p className="p-2 text-[12px]" style={{ color: "var(--builder-muted)" }}>
          Loading runs…
        </p>
      ) : null}
    </nav>
  );
}

function RunListRow(
  props:
    | { kind: "running"; runId: string; selected: boolean; onSelect: () => void }
    | {
        kind: "terminal";
        run: WorkflowRunSummary;
        runId: string;
        selected: boolean;
        onSelect: () => void;
      },
) {
  const isRunning = props.kind === "running";
  const status: RowStatus = isRunning ? "running" : props.run.status;
  const sourceLabel = isRunning
    ? "Manual run"
    : SOURCE_LABEL[props.run.triggeredBy ?? "unknown"];
  const meta = isRunning ? "now" : metaLine(props.run);
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-pressed={props.selected}
      data-testid={`run-row-${props.runId}`}
      data-status={status}
      data-selected={props.selected}
      className="flex min-w-0 flex-col gap-1 rounded-[6px] border px-2.5 py-2 text-left"
      style={{
        borderColor: props.selected
          ? "var(--builder-accent, #0284c7)"
          : "var(--builder-border)",
        background: props.selected ? "var(--builder-panel-2)" : "var(--builder-panel)",
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        <span className="min-w-0 break-words text-[12px]" style={{ color: "var(--builder-text)" }}>
          {sourceLabel}
        </span>
        {!isRunning && props.run.isTest ? (
          props.run.isLiveTest ? <LiveTestTag /> : <TestTag />
        ) : null}
      </div>
      <span className="min-w-0 break-words text-[11px]" style={{ color: "var(--builder-muted)" }}>
        {meta}
      </span>
    </button>
  );
}
