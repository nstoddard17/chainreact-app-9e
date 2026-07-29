"use client";

import { useState } from "react";
import type {
  AgentReadinessBlocker,
  AgentReadinessTestStatus,
} from "@/core/workflows/agentReadiness";
import {
  isConfirmationRequiredError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { DestructiveActionConfirmationModal } from "./DestructiveActionConfirmationModal";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided Test and Activate stage bodies.
 *
 * Thin presentational wrappers over the EXISTING run/activation paths:
 *   - Test dispatches through the builder's run controls (`handleTestWorkflow`
 *     — testMode:true, external actions skipped, SEC-2 gate) after the builder
 *     callback saves a dirty draft, exactly like Apply-and-test does.
 *   - Activate calls the builder-provided callback (save-if-dirty →
 *     `activateWorkflow` → router.refresh). A server 409 CONFIRMATION_REQUIRED
 *     routes through the SAME DestructiveActionConfirmationModal the header
 *     uses. Activation NEVER happens without this explicit click (and, for
 *     destructive workflows, the typed confirmation).
 *
 * Failure copy comes from the typed client errors (already safe/sanitized
 * server-side) or fixed fallbacks — never raw provider output.
 */

export interface GuidedTestSectionProps {
  /** Save-if-dirty, then dispatch the safe test run. Rejects with a safe message. */
  readonly onTest: () => Promise<void>;
  readonly testStatus: AgentReadinessTestStatus;
  /** Last dispatch error from the run controls (already safe), if any. */
  readonly runError?: string | null;
  /** True while the local draft has unsaved edits (drives the save note). */
  readonly isDirty?: boolean;
}

export function GuidedTestSection({
  onTest,
  testStatus,
  runError,
  isDirty,
}: GuidedTestSectionProps) {
  const [dispatching, setDispatching] = useState(false);
  const busy = dispatching || testStatus === "running";

  return (
    <div data-testid="guided-test-body">
      <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
        {testStatus === "running"
          ? "Running a test of your workflow…"
          : "Everything is filled in and connected. Run a safe test — external actions are skipped and nothing goes live."}
        {isDirty && testStatus !== "running" ? " Your draft is saved first." : ""}
      </p>
      <button
        type="button"
        data-testid="guided-test-button"
        onClick={() => {
          if (busy) return;
          setDispatching(true);
          void onTest().finally(() => setDispatching(false));
        }}
        disabled={busy}
        className="mt-2 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Run this workflow in test mode (external actions are skipped)"
      >
        {busy ? "Testing…" : "Test workflow"}
      </button>
      {runError ? (
        <p
          data-testid="guided-test-error"
          role="alert"
          className="mt-1 text-[11px] text-destructive"
        >
          {runError}
        </p>
      ) : null}
    </div>
  );
}

export interface GuidedActivateSectionProps {
  /**
   * Save-if-dirty → activate → refresh lifecycle state. Rejects with the typed
   * client error (409 CONFIRMATION_REQUIRED handled here via the shared modal).
   */
  readonly onActivate: (confirmationText?: string) => Promise<void>;
  /** True when a passed test earned this stage (vs a non-testable trigger). */
  readonly testPassed: boolean;
  /** Advisory (non-blocking) warnings from the readiness verdict. */
  readonly warnings: readonly AgentReadinessBlocker[];
  /** Connected-provider count for the summary line. */
  readonly connectedCount: number;
}

export function GuidedActivateSection({
  onActivate,
  testPassed,
  warnings,
  connectedCount,
}: GuidedActivateSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationDetail, setConfirmationDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);

  async function run(confirmationText?: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onActivate(confirmationText);
      setConfirmationDetail(null);
    } catch (err) {
      if (isConfirmationRequiredError(err)) {
        setConfirmationDetail(err.detail);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't activate the workflow.");
        setConfirmationDetail(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="guided-activate-body">
      <p className="text-[11px]" style={{ color: "var(--builder-text)" }}>
        {testPassed ? "✓ Test passed. " : ""}
        {connectedCount > 0
          ? `${connectedCount} app${connectedCount === 1 ? "" : "s"} connected and every required field is filled.`
          : "Every required field is filled."}{" "}
        Activating turns the workflow on — it will run when its trigger fires.
      </p>
      {warnings.length > 0 ? (
        <ul className="mt-1 space-y-0.5" data-testid="guided-activate-warnings">
          {warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        data-testid="guided-activate-button"
        onClick={() => void run()}
        disabled={busy || confirmationDetail !== null}
        className="mt-2 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Activate this workflow (asks for confirmation when a step is destructive)"
      >
        {busy ? "Activating…" : "Activate workflow"}
      </button>
      {error ? (
        <p
          data-testid="guided-activate-error"
          role="alert"
          className="mt-1 text-[11px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      {confirmationDetail ? (
        <DestructiveActionConfirmationModal
          detail={confirmationDetail}
          busy={busy}
          onConfirm={() => run(confirmationDetail.confirmationText)}
          onCancel={() => setConfirmationDetail(null)}
        />
      ) : null}
    </div>
  );
}
