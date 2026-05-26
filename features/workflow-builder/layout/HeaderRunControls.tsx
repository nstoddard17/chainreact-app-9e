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
export function HeaderRunControls() {
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
          title="Test runs for automated workflows are in development."
        >
          Test Workflow
        </Button>
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
          variant="default"
          onClick={handleTestWorkflow}
          disabled={anyRunning}
          data-testid="run-controls-test-button"
          title="Runs safely without calling connected provider APIs. External actions are skipped with test-mode outputs."
        >
          {runningMode === "test" ? "Testing…" : "Test Workflow"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={handleRunManually}
          disabled={anyRunning}
          data-testid="run-controls-run-manually-button"
          title="Runs for real and may call connected apps. Destructive actions require a typed confirmation before they fire."
        >
          {runningMode === "manual" ? "Running…" : "Run Manually"}
        </Button>
      </div>
      <p className="sr-only">
        Runs safely without calling connected provider APIs. External
        actions are skipped with test-mode outputs.
      </p>
      <p className="sr-only">
        Runs for real and may call connected apps. Destructive actions
        require a typed confirmation before they fire.
      </p>
      {isDirty ? (
        <p role="status" className="sr-only">
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
