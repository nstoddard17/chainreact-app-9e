"use client";

import { useState } from "react";
import {
  isConfirmationRequiredError,
  runNowWorkflow,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { getTriggerKind, type TriggerKind } from "../state/triggerKind";

/**
 * Run-controls state machine extracted from the legacy `RunNowPanel`
 * (Slice 3.3 → Slice 3.POSTSEC-6B). Slice 4.BUILDER-RUN-PANEL-1 lifts
 * the visible buttons into `HeaderRunControls` inside the BuilderHeader,
 * while RunResultsPanel + RunResultsRepairBlock relocate into the right
 * drawer's `results` mode. This hook owns the run/test dispatch logic;
 * the UI is a presentational consumer.
 *
 * Crucial invariants preserved verbatim from POSTSEC-6 / POSTSEC-6B /
 * POSTSEC-5:
 *   - Test Workflow NEVER becomes Run Manually.
 *   - Run Manually NEVER silently degrades to a test run, including
 *     the post-modal retry path.
 *   - `testMode` and `confirmationText` travel as envelope siblings of
 *     `inputs`; never injected into the trigger payload.
 *   - Test Workflow never opens the confirmation modal (server should
 *     never emit 409 for testMode=true; defensive surface treats it
 *     as a plain error if it ever does).
 *
 * Architectural boundary (preserved from Slice 3.2):
 *   - Modal Save → pending graph state (configSlice / graphSlice).
 *   - Toolbar Save → workflow persistence (`updateWorkflow`).
 *   - Run controls → execute the already-saved workflow. They do NOT
 *     save. Unsaved-changes warning surfaces when applicable.
 */
type RunningMode = "test" | "manual" | null;

export interface UseRunControlsResult {
  /** workflowId from graphSlice; null until the workflow has hydrated. */
  workflowId: string | null;
  /** `true` while graphSlice has unsaved edits. */
  isDirty: boolean;
  /** Trigger classification for the current graph (manual / automated / none). */
  triggerKind: TriggerKind;
  /** Which button is currently in flight (or null). */
  runningMode: RunningMode;
  /** True iff any button is in flight. */
  anyRunning: boolean;
  /** Last run dispatch error (resets on each new attempt). */
  runError: string | null;
  /** runId of the most-recent dispatch from this session, or null. */
  lastRunId: string | null;
  /** True iff `lastRunId` was a testMode dispatch (drives copy). */
  lastRunIsTest: boolean;
  /** Non-null = confirmation modal is open (Run Manually only). */
  confirmationDetail: WorkflowConfirmationRequiredDetail | null;

  handleTestWorkflow(): Promise<void>;
  handleRunManually(): Promise<void>;
  handleConfirmRunManually(): Promise<void>;
  handleCancelConfirm(): void;
}

export function useRunControls(): UseRunControlsResult {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const isDirty = useGraphSlice((s) => s.isDirty);

  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastRunIsTest, setLastRunIsTest] = useState<boolean>(false);
  const [confirmationDetail, setConfirmationDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);
  const startTracking = useRunSlice((s) => s.startTracking);

  const triggerKind: TriggerKind = getTriggerKind(pendingNodes);

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
    // installed at WorkflowBuilder picks this up and renders the
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
      // appear for test workflow runs even on destructive workflows.
      await dispatchRun(workflowId, true, undefined);
    } catch (err) {
      // Defensive — server should never return 409 CONFIRMATION_REQUIRED
      // when testMode=true (SEC-4B bypasses for tests by contract).
      // If it does, surface as a plain error rather than routing into
      // the destructive-action modal — a test-mode confirmation flow
      // would be UX nonsense.
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

  return {
    workflowId,
    isDirty,
    triggerKind,
    runningMode,
    anyRunning: runningMode !== null,
    runError,
    lastRunId,
    lastRunIsTest,
    confirmationDetail,
    handleTestWorkflow,
    handleRunManually,
    handleConfirmRunManually,
    handleCancelConfirm,
  };
}
