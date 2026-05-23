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
 * Run Now panel — Slice 3.3 + Slice 3.POSTSEC-6.
 *
 * Only renders when the workflow has a `native:manual.run` trigger. The
 * panel surfaces two explicit actions:
 *
 *   • Test Run (primary) — calls `runNowWorkflow(id, inputs,
 *     { testMode: true })`. The engine (SEC-2) short-circuits external
 *     and high-risk handlers; destructive provider calls never fire,
 *     so the SEC-4B confirmation modal is intentionally bypassed.
 *     `triggeredBy: "test"` + `isTest: true` distinguishes the run in
 *     the run history.
 *
 *   • Run Live (destructive-style secondary) — calls `runNowWorkflow`
 *     with `testMode: false`. Real provider APIs fire. If the workflow
 *     contains a SEC-4B-gated action the first shot returns
 *     409 CONFIRMATION_REQUIRED; the destructive-action confirmation
 *     modal opens and the user types the server-issued phrase to retry.
 *
 * Crucial invariant (no silent promotion / demotion):
 *   - Test Run NEVER becomes Live Run.
 *   - Live Run NEVER silently degrades to Test Run.
 *   - Confirmation retry preserves `testMode: false` so the user can't
 *     accidentally have a destructive-action confirmation flow execute
 *     as a sandbox run.
 *
 * Architectural boundary (preserved from Slice 3.2):
 *   - Modal Save updates pending graph state in `configSlice` /
 *     `graphSlice` only.
 *   - Toolbar Save persists workflow definition via `updateWorkflow`.
 *   - Run Now (either mode) executes the *already-saved* workflow. It
 *     does NOT trigger a save. If the user has unsaved edits, the panel
 *     surfaces a warning so they don't accidentally test against the
 *     stale server-side definition.
 *
 * The panel intentionally does not auto-save before run: hiding a save
 * inside a run button conflates two operations and was a frequent
 * source of "but I clicked Run, why are my edits gone?" confusion in
 * V1. The user explicitly Saves, then Runs.
 */

/**
 * Which button is currently in-flight. `null` = nothing running. Used
 * for per-button busy labelling + disabling both buttons so the user
 * can't fire a Test Run and a Live Run concurrently.
 */
type RunningMode = "test" | "live" | null;

export function RunNowPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const isDirty = useGraphSlice((s) => s.isDirty);

  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunIsTest, setLastRunIsTest] = useState<boolean>(false);
  // Slice 3.POSTSEC-5 — pending typed-confirmation modal state for the
  // Live Run path. Non-null = modal open; the server's structured 409
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
    testMode: boolean,
    confirmationText: string | undefined,
  ): Promise<void> {
    const result = await runNowWorkflow(
      targetWorkflowId,
      { inputs: {} },
      confirmationText !== undefined
        ? { testMode, confirmationText }
        : { testMode },
    );
    setLastRunId(result.runId);
    setLastRunIsTest(testMode);
    // Slice 3.8 — kick off latest-run tracking. The polling hook
    // installed in WorkflowBuilder picks this up and renders the
    // result into RunResultsPanel. Save state stays a separate
    // concern: Run Now does NOT call updateWorkflow.
    startTracking({ workflowId: targetWorkflowId, runId: result.runId });
  }

  async function handleTestRun(): Promise<void> {
    if (!workflowId) return;
    if (runningMode !== null) return;
    if (confirmationDetail !== null) return;
    setRunningMode("test");
    setRunError(null);
    try {
      // testMode: true → SEC-2 blocks external handlers before the
      // SEC-4B confirmation gate ever evaluates. The modal MUST NOT
      // appear for test runs even on destructive workflows — that's
      // the whole point of an explicit safe-test surface.
      await dispatchRun(workflowId, true, undefined);
    } catch (err) {
      // Defensive — server should never return 409 CONFIRMATION_REQUIRED
      // when testMode=true (SEC-4B bypasses the gate for test runs by
      // contract). If it does, surface as a plain error rather than
      // routing into the destructive-action modal — a test-mode
      // confirmation flow would be UX nonsense.
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Test Run failed.";
      setRunError(message);
    } finally {
      setRunningMode(null);
    }
  }

  async function handleLiveRun(): Promise<void> {
    if (!workflowId) return;
    if (runningMode !== null) return;
    if (confirmationDetail !== null) return;
    setRunningMode("live");
    setRunError(null);
    try {
      await dispatchRun(workflowId, false, undefined);
    } catch (err) {
      // Slice 3.POSTSEC-5 — server returned 409 CONFIRMATION_REQUIRED.
      // Defer to the typed-confirmation modal; clear the in-flight
      // spinner so the Live Run button isn't stuck in "Running…"
      // while the user reads the modal.
      if (isConfirmationRequiredError(err)) {
        setConfirmationDetail(err.detail);
        setRunningMode(null);
        return;
      }
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Live Run failed.";
      setRunError(message);
    } finally {
      setRunningMode(null);
    }
  }

  async function handleConfirmLiveRun(): Promise<void> {
    if (!workflowId || !confirmationDetail) return;
    setRunningMode("live");
    setRunError(null);
    try {
      // Retry preserves testMode:false (Live Run never silently flips
      // to Test Run mid-confirmation) and adds the server-issued phrase
      // verbatim.
      await dispatchRun(
        workflowId,
        false,
        confirmationDetail.confirmationText,
      );
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
            : "Live Run failed.";
      setRunError(message);
      setConfirmationDetail(null);
    } finally {
      setRunningMode(null);
    }
  }

  function handleCancelConfirm(): void {
    setConfirmationDetail(null);
  }

  const anyRunning = runningMode !== null;

  return (
    <section
      aria-label="Manual run"
      className="flex flex-col gap-3 rounded border border-input bg-card p-3"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Manual run</h3>
        <p className="text-xs text-muted-foreground">
          Execute the saved workflow once with empty trigger inputs.
        </p>
      </header>

      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        data-testid="run-now-actions"
      >
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={handleTestRun}
            disabled={anyRunning}
            data-testid="run-now-test-button"
          >
            {runningMode === "test" ? "Testing…" : "Test Run"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Runs safely without calling connected provider APIs. External
            actions are skipped with test-mode outputs.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleLiveRun}
            disabled={anyRunning}
            data-testid="run-now-live-button"
          >
            {runningMode === "live" ? "Running…" : "Run Live"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Runs for real and may call connected apps. Destructive actions
            require a typed confirmation before they fire.
          </p>
        </div>
      </div>

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
          Enqueued {lastRunIsTest ? "test " : ""}run{" "}
          <code className="font-mono">{lastRunId}</code>.
        </p>
      ) : null}
      {confirmationDetail && (
        <DestructiveActionConfirmationModal
          detail={confirmationDetail}
          busy={runningMode === "live"}
          onConfirm={handleConfirmLiveRun}
          onCancel={handleCancelConfirm}
        />
      )}
    </section>
  );
}
