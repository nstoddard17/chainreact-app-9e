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
        <div className="flex min-h-0 flex-1">
          <RunList
            runs={runs}
            selectedRunId={selectedRunId}
            onSelect={setSelectedRunId}
            liveRunVisible={liveRunVisible}
            liveRunId={liveRunId}
            loading={listState === "loading"}
          />
          <RunDetailPane
            workflowId={workflowId}
            selectedRunId={selectedRunId}
            isLiveSelection={liveRunVisible && selectedRunId === liveRunId}
            {...(onOpenFailedStep ? { onOpenFailedStep } : {})}
            runEditBlocked={runEditBlocked ?? false}
          />
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
      className="flex w-[300px] shrink-0 flex-col gap-1 overflow-y-auto border-r p-2"
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
      className="flex flex-col gap-1 rounded-[6px] border px-2.5 py-2 text-left"
      style={{
        borderColor: props.selected
          ? "var(--builder-accent, #0284c7)"
          : "var(--builder-border)",
        background: props.selected ? "var(--builder-panel-2)" : "var(--builder-panel)",
      }}
    >
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-[12px]" style={{ color: "var(--builder-text)" }}>
          {sourceLabel}
        </span>
        {!isRunning && props.run.isTest ? <TestTag /> : null}
      </div>
      <span className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
        {meta}
      </span>
    </button>
  );
}
