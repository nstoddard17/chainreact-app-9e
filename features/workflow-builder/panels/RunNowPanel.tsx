"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import { runNowWorkflow, WorkflowApiError } from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";

/**
 * Run Now panel — Slice 3.3.
 *
 * Only renders when the workflow has a `native:manual.run` trigger.
 * Clicking "Run Now" dispatches `POST /api/workflows/[id]/run-now` via
 * the typed client. Inputs are passed as the empty object `{}` for now;
 * a full input editor (key/value pairs, mirroring V1's "Test Run inputs"
 * panel) lands in Slice 3.8 alongside the test-run streaming surface.
 *
 * Architectural boundary (preserved from Slice 3.2):
 *   - Modal Save updates pending graph state in `configSlice` /
 *     `graphSlice` only.
 *   - Toolbar Save persists workflow definition via `updateWorkflow`.
 *   - Run Now executes the *already-saved* workflow. It does NOT
 *     trigger a save. If the user has unsaved edits, the panel surfaces
 *     a warning so they don't accidentally test against the stale
 *     server-side definition.
 *
 * The panel intentionally does not auto-save before run: hiding a save
 * inside a run button conflates two operations and was a frequent
 * source of "but I clicked Run, why are my edits gone?" confusion in
 * V1. The user explicitly Saves, then Runs.
 */
export function RunNowPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const isDirty = useGraphSlice((s) => s.isDirty);

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const startTracking = useRunSlice((s) => s.startTracking);

  const hasManualTrigger = pendingNodes.some(
    (n) =>
      n.kind === "trigger" &&
      n.provider === MANUAL_TRIGGER_PROVIDER &&
      n.type === MANUAL_TRIGGER_EVENT_TYPE,
  );

  // Hidden when the workflow has no manual trigger — Run Now is
  // meaningless for webhook / scheduled / polling triggers (those fire
  // via their own activation pathways).
  if (!hasManualTrigger || !workflowId) return null;

  async function handleRun(): Promise<void> {
    if (!workflowId) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const result = await runNowWorkflow(workflowId, { inputs: {} });
      setLastRunId(result.runId);
      // Slice 3.8 — kick off latest-run tracking. The polling hook
      // installed in WorkflowBuilder picks this up and renders the
      // result into RunResultsPanel. Save state stays a separate
      // concern: Run Now does NOT call updateWorkflow.
      startTracking({ workflowId, runId: result.runId });
    } catch (err) {
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Run Now failed.";
      setRunError(message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section
      aria-label="Manual run"
      className="flex flex-col gap-2 rounded border border-input bg-card p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-sm font-medium">Manual run</h3>
          <p className="text-xs text-muted-foreground">
            Runs the saved workflow once with empty trigger inputs.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning ? "Running…" : "Run Now"}
        </Button>
      </header>
      {isDirty ? (
        <p
          role="status"
          className="text-xs text-warning-foreground"
        >
          You have unsaved changes. Run Now will execute the saved
          workflow, not the in-progress edits.
        </p>
      ) : null}
      {runError ? (
        <p role="alert" className="text-xs text-destructive">
          {runError}
        </p>
      ) : null}
      {lastRunId && !runError ? (
        <p className="text-xs text-muted-foreground" data-testid="run-now-success">
          Enqueued run <code className="font-mono">{lastRunId}</code>.
        </p>
      ) : null}
    </section>
  );
}
