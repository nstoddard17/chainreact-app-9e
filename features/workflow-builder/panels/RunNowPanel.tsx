"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  isConfirmationRequiredError,
  runNowWorkflow,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import {
  getTriggerKind,
  type TriggerKind,
} from "../state/triggerKind";
import { DestructiveActionConfirmationModal } from "./DestructiveActionConfirmationModal";

/**
 * Run-controls panel — Slice 3.3 → Slice 3.POSTSEC-6B.
 *
 * The panel branches on the workflow's trigger kind
 * (`features/workflow-builder/state/triggerKind.ts`):
 *
 *   - **Manual workflows** (`native:manual.run` trigger):
 *       The user fires the workflow — Run Manually is the primary live
 *       action. Two buttons:
 *         • Test Workflow (primary)   — testMode:true, skips modal
 *         • Run Manually  (destructive) — testMode:false, opens modal
 *           on 409 CONFIRMATION_REQUIRED. Retry preserves testMode:false
 *           plus the typed confirmation phrase.
 *
 *   - **Automated workflows** (scheduled, provider event, webhook,
 *     polling — anything not `native:manual.run`):
 *       The workflow is fired by an external event after activation.
 *       Manually live-running it from the builder would either need a
 *       fake event payload or would short-circuit the trigger; neither
 *       is a normal end-user flow. The panel shows ONLY a Test Workflow
 *       surface, currently rendered as a disabled button with copy
 *       explaining how to validate the workflow today (activate it and
 *       trigger the source event). Wiring mock/sample event data to a
 *       non-manual test path is a follow-up slice — backend run-now
 *       still requires a manual trigger node server-side.
 *
 *   - **No trigger** (graph still being composed):
 *       Panel is hidden — there is nothing to run or test yet.
 *
 * Crucial invariant (no silent promotion / demotion, carried from
 * POSTSEC-6):
 *   - Test Workflow NEVER becomes Run Manually.
 *   - Run Manually NEVER silently degrades to a test run, including
 *     the post-modal retry path.
 *   - `testMode` and `confirmationText` travel as envelope siblings of
 *     `inputs`; never injected into the trigger payload.
 *
 * Architectural boundary (preserved from Slice 3.2):
 *   - Modal Save → pending graph state (configSlice / graphSlice only).
 *   - Toolbar Save → workflow persistence (updateWorkflow).
 *   - Run controls → execute the *already-saved* workflow. They do
 *     NOT save. Unsaved-changes warning surfaces when applicable.
 */

/**
 * Which button is currently in-flight. `null` = nothing running. Used
 * for per-button busy labelling + disabling both buttons so the user
 * can't fire a Test Workflow and a Run Manually concurrently.
 */
type RunningMode = "test" | "manual" | null;

export function RunNowPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const isDirty = useGraphSlice((s) => s.isDirty);

  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunIsTest, setLastRunIsTest] = useState<boolean>(false);
  // Slice 3.POSTSEC-5 — pending typed-confirmation modal state for the
  // Run Manually path. Non-null = modal open; the server's structured
  // 409 detail is the source of truth for the action list + required
  // phrase. Only Run Manually opens this; Test Workflow never does.
  const [confirmationDetail, setConfirmationDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);
  const startTracking = useRunSlice((s) => s.startTracking);

  const triggerKind: TriggerKind = getTriggerKind(pendingNodes);

  // Hidden when there is no trigger yet OR the workflow hasn't
  // hydrated (no workflowId). Both branches render the same null.
  if (triggerKind === "none" || !workflowId) return null;

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
    // concern: the run controls never call updateWorkflow.
    startTracking({ workflowId: targetWorkflowId, runId: result.runId });
  }

  async function handleTestWorkflow(): Promise<void> {
    if (!workflowId) return;
    if (runningMode !== null) return;
    if (confirmationDetail !== null) return;
    setRunningMode("test");
    setRunError(null);
    try {
      // testMode: true → SEC-2 blocks external handlers before the
      // SEC-4B confirmation gate ever evaluates. The modal MUST NOT
      // appear for test workflow runs even on destructive workflows
      // — that's the whole point of an explicit safe-test surface.
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
            : "Test Workflow failed.";
      setRunError(message);
    } finally {
      setRunningMode(null);
    }
  }

  async function handleRunManually(): Promise<void> {
    if (!workflowId) return;
    if (runningMode !== null) return;
    if (confirmationDetail !== null) return;
    setRunningMode("manual");
    setRunError(null);
    try {
      await dispatchRun(workflowId, false, undefined);
    } catch (err) {
      // Slice 3.POSTSEC-5 — server returned 409 CONFIRMATION_REQUIRED.
      // Defer to the typed-confirmation modal; clear the in-flight
      // spinner so the Run Manually button isn't stuck in "Running…"
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
            : "Run Manually failed.";
      setRunError(message);
    } finally {
      setRunningMode(null);
    }
  }

  async function handleConfirmRunManually(): Promise<void> {
    if (!workflowId || !confirmationDetail) return;
    setRunningMode("manual");
    setRunError(null);
    try {
      // Retry preserves testMode:false (Run Manually never silently
      // flips to Test Workflow mid-confirmation) and adds the
      // server-issued phrase verbatim.
      await dispatchRun(
        workflowId,
        false,
        confirmationDetail.confirmationText,
      );
      setConfirmationDetail(null);
    } catch (err) {
      // Defensive — the server's `isValidConfirmationText` matches the
      // client's modal validation exactly, so a second 409 on retry is
      // rare. Treat any failure as a normal Run Manually failure and
      // close the modal so the user isn't stuck.
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Run Manually failed.";
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

  // ── automated workflow surface ────────────────────────────────────
  if (triggerKind === "automated") {
    return (
      <section
        aria-label="Workflow testing"
        className="flex flex-col gap-3 rounded border border-input bg-card p-3"
        data-testid="run-controls-panel-automated"
      >
        <header className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Test workflow</h3>
          <p className="text-xs text-muted-foreground">
            This workflow is fired by an external event (scheduled, webhook,
            or provider event). Manual live runs aren&rsquo;t the normal path
            — use Activate to wire up the trigger.
          </p>
        </header>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled
          data-testid="run-controls-test-button"
          title="Test runs for automated workflows are in development."
        >
          Test Workflow
        </Button>
        <p className="text-xs text-muted-foreground">
          Test runs for automated workflows are in development. To validate
          this workflow end-to-end today, activate it and trigger the source
          event.
        </p>
      </section>
    );
  }

  // ── manual workflow surface ───────────────────────────────────────
  // (triggerKind === "manual")
  return (
    <section
      aria-label="Manual run"
      className="flex flex-col gap-3 rounded border border-input bg-card p-3"
      data-testid="run-controls-panel-manual"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Manual run</h3>
        <p className="text-xs text-muted-foreground">
          Execute the saved workflow once with empty trigger inputs.
        </p>
      </header>

      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        data-testid="run-controls-actions"
      >
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={handleTestWorkflow}
            disabled={anyRunning}
            data-testid="run-controls-test-button"
          >
            {runningMode === "test" ? "Testing…" : "Test Workflow"}
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
            onClick={handleRunManually}
            disabled={anyRunning}
            data-testid="run-controls-run-manually-button"
          >
            {runningMode === "manual" ? "Running…" : "Run Manually"}
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
          You have unsaved changes. Run controls execute the saved workflow,
          not the in-progress edits.
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
          busy={runningMode === "manual"}
          onConfirm={handleConfirmRunManually}
          onCancel={handleCancelConfirm}
        />
      )}
    </section>
  );
}
