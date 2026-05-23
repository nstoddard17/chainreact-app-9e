"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import {
  isConfirmationRequiredError,
  runNowWorkflow,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { DestructiveActionConfirmationModal } from "./DestructiveActionConfirmationModal";

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
  // Slice 3.POSTSEC-5 — pending typed-confirmation modal state for the
  // real-run path. Non-null = modal open; the server's structured 409
  // detail is the source of truth for the action list + required phrase.
  const [confirmationDetail, setConfirmationDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);
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

  async function dispatchRun(
    targetWorkflowId: string,
    confirmationText: string | undefined,
  ): Promise<void> {
    const result = await runNowWorkflow(
      targetWorkflowId,
      { inputs: {} },
      confirmationText !== undefined ? { confirmationText } : {},
    );
    setLastRunId(result.runId);
    // Slice 3.8 — kick off latest-run tracking. The polling hook
    // installed in WorkflowBuilder picks this up and renders the
    // result into RunResultsPanel. Save state stays a separate
    // concern: Run Now does NOT call updateWorkflow.
    startTracking({ workflowId: targetWorkflowId, runId: result.runId });
  }

  async function handleRun(): Promise<void> {
    if (!workflowId) return;
    if (confirmationDetail !== null) return;
    setIsRunning(true);
    setRunError(null);
    try {
      await dispatchRun(workflowId, undefined);
    } catch (err) {
      // Slice 3.POSTSEC-5 — server returned 409 CONFIRMATION_REQUIRED.
      // Defer to the typed-confirmation modal; clear the in-flight
      // spinner so the Run Now button isn't stuck in "Running…" while
      // the user reads the modal.
      if (isConfirmationRequiredError(err)) {
        setConfirmationDetail(err.detail);
        setIsRunning(false);
        return;
      }
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

  async function handleConfirmRun(): Promise<void> {
    if (!workflowId || !confirmationDetail) return;
    setIsRunning(true);
    setRunError(null);
    try {
      await dispatchRun(workflowId, confirmationDetail.confirmationText);
      setConfirmationDetail(null);
    } catch (err) {
      // Defensive — the server's `isValidConfirmationText` matches the
      // client's modal validation exactly, so a second 409 on retry is
      // rare. Treat any failure as a normal Run Now failure and close
      // the modal so the user isn't stuck.
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Run Now failed.";
      setRunError(message);
      setConfirmationDetail(null);
    } finally {
      setIsRunning(false);
    }
  }

  function handleCancelConfirm(): void {
    setConfirmationDetail(null);
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
      {confirmationDetail && (
        <DestructiveActionConfirmationModal
          detail={confirmationDetail}
          busy={isRunning}
          onConfirm={handleConfirmRun}
          onCancel={handleCancelConfirm}
        />
      )}
    </section>
  );
}
