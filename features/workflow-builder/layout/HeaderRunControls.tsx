"use client";

import { Button } from "@/components/ui/button";
import { useRunControls } from "../hooks/useRunControls";
import { DestructiveActionConfirmationModal } from "../panels/DestructiveActionConfirmationModal";

/**
 * Header-mounted run/test controls (Slice 4.BUILDER-RUN-PANEL-1).
 *
 * Replaces the old below-canvas `RunNowPanel` block. Behaviorally
 * identical — the state machine moved into `useRunControls`, and this
 * component is a presentational consumer that:
 *   - Renders Test Workflow + Run Manually buttons for manual workflows.
 *   - Renders a disabled Test Workflow surface for automated workflows.
 *   - Hides itself when the graph has no trigger.
 *   - Shows the destructive-action confirmation modal on 409.
 *   - Surfaces the runError + the lastRunId enqueued-line in compact form.
 *   - Surfaces the unsaved-changes hint compactly.
 *
 * Testid contract preserved verbatim so the migrated test suite
 * (formerly `RunNowPanel.test.tsx`) passes unchanged:
 *   - `run-controls-panel-manual` / `run-controls-panel-automated`
 *   - `run-controls-test-button` / `run-controls-run-manually-button`
 *   - `run-controls-actions`
 *   - `run-now-success`
 *   - `destructive-action-confirmation-modal` (via the modal component)
 *
 * Visual: a compact button cluster suitable for the BuilderHeader's
 * 48px strip. The descriptive copy from the old panel rides as `title`
 * tooltips + tightly-stacked secondary lines that the header bar can
 * accommodate without breaking layout. Verbose explanatory paragraphs
 * from the section variant are preserved as `<p>` siblings so existing
 * text-content assertions ("Runs safely without calling connected
 * provider APIs", etc.) keep matching.
 */
/**
 * BUILDER-READINESS — number of blocking validation errors (missing required
 * fields, no trigger, unconfigured nodes, invalid router routes). When > 0,
 * Run Manually is disabled; the visible validation pill opens the summary that
 * lists what's missing and which node. Test Workflow stays enabled — test mode
 * skips external/high-risk handlers, so an incomplete action isn't executed.
 */
export interface HeaderRunControlsProps {
  blockingIssueCount?: number;
  /**
   * WF-RUNPERM follow-up — true when the viewer may NOT run/edit this workflow
   * because it runs under the creator's private OAuth connection (server-derived
   * `viewerCanRunEdit === false`). When set, Test + Run controls are disabled and
   * the viewer is pointed to Duplicate. This is UI polish only; the run-now /
   * activate routes already enforce the same policy with a typed 403 — the
   * disabled control is the friendly front door, not the security boundary.
   */
  runEditBlocked?: boolean;
}

/**
 * Safe, non-leaking copy shown when the viewer can't run/edit a private-
 * credential workflow. Carries no email / provider label / scope / connection
 * detail — only the duplicate-to-fix path (matches the list-row badge copy and
 * the server 403 message).
 */
export const PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY =
  "This workflow runs with the creator’s private connection. Duplicate it to use your own connection.";

export function HeaderRunControls({
  blockingIssueCount = 0,
  runEditBlocked = false,
}: HeaderRunControlsProps = {}) {
  const {
    workflowId,
    isDirty,
    triggerKind,
    runningMode,
    anyRunning,
    runError,
    lastRunId,
    lastRunIsTest,
    confirmationDetail,
    handleTestWorkflow,
    handleRunManually,
    handleConfirmRunManually,
    handleCancelConfirm,
  } = useRunControls();
  const runBlocked = blockingIssueCount > 0;

  // Hidden when there is no trigger yet OR the workflow hasn't
  // hydrated. Mirrors the old RunNowPanel guard.
  if (triggerKind === "none" || !workflowId) return null;

  if (triggerKind === "automated") {
    return (
      <section
        aria-label="Workflow testing"
        className="flex flex-col gap-1"
        data-testid="run-controls-panel-automated"
      >
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled
          data-testid="run-controls-test-button"
          title={
            runEditBlocked
              ? PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY
              : "Test runs for automated workflows are in development."
          }
        >
          Test Workflow
        </Button>
        {runEditBlocked ? (
          <p
            role="status"
            data-testid="run-controls-private-credential-status"
            className="max-w-[220px] text-[11px] leading-tight"
            style={{ color: "var(--builder-muted)" }}
          >
            {PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY}
          </p>
        ) : null}
        <p className="sr-only">
          This workflow is fired by an external event (scheduled, webhook,
          or provider event). Manual live runs aren&rsquo;t the normal path
          — use Activate to wire up the trigger.
        </p>
        <p className="sr-only">
          Test runs for automated workflows are in development. To validate
          this workflow end-to-end today, activate it and trigger the source
          event.
        </p>
      </section>
    );
  }

  // Manual trigger surface.
  return (
    <section
      aria-label="Manual run"
      className="flex flex-col gap-1"
      data-testid="run-controls-panel-manual"
    >
      <div
        className="flex items-center gap-2"
        data-testid="run-controls-actions"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleTestWorkflow}
          disabled={anyRunning || runEditBlocked}
          data-testid="run-controls-test-button"
          title={
            runEditBlocked
              ? PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY
              : "Runs safely without calling connected provider APIs. External actions are skipped with test-mode outputs."
          }
          className="builder-mono inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px]"
        >
          <span>{runningMode === "test" ? "Testing…" : "Test Workflow"}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={handleRunManually}
          disabled={anyRunning || runBlocked || runEditBlocked}
          data-testid="run-controls-run-manually-button"
          title={
            runEditBlocked
              ? PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY
              : runBlocked
                ? `Resolve ${blockingIssueCount} setup ${blockingIssueCount === 1 ? "issue" : "issues"} before running — open the validation panel to see what's missing.`
                : "Runs for real and may call connected apps. Destructive actions require a typed confirmation before they fire."
          }
        >
          {runningMode === "manual" ? "Running…" : "Run Manually"}
        </Button>
      </div>
      {runEditBlocked ? (
        <p
          role="status"
          data-testid="run-controls-private-credential-status"
          className="max-w-[260px] text-[11px] leading-tight"
          style={{ color: "var(--builder-muted)" }}
        >
          {PRIVATE_CREDENTIAL_RUN_BLOCKED_COPY}
        </p>
      ) : null}
      {runBlocked ? (
        <p
          role="status"
          className="sr-only"
          data-testid="run-controls-blocked-status"
        >
          Run Manually is disabled: resolve {blockingIssueCount} setup{" "}
          {blockingIssueCount === 1 ? "issue" : "issues"} first. Open the
          validation panel to see which nodes need attention.
        </p>
      ) : null}
      <p className="sr-only">
        Runs safely without calling connected provider APIs. External
        actions are skipped with test-mode outputs.
      </p>
      <p className="sr-only">
        Runs for real and may call connected apps. Destructive actions
        require a typed confirmation before they fire.
      </p>
      {isDirty ? (
        <p
          role="status"
          className="sr-only"
          data-testid="header-run-unsaved-changes-status"
        >
          You have unsaved changes. Run controls execute the saved workflow,
          not the in-progress edits.
        </p>
      ) : null}
      {runError ? (
        <p role="alert" className="sr-only">
          {runError}
        </p>
      ) : null}
      {lastRunId && !runError ? (
        <p className="sr-only" data-testid="run-now-success">
          Enqueued {lastRunIsTest ? "test " : ""}run {lastRunId}.
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
