"use client";

import { useState } from "react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import {
  activateWorkflow,
  isConfirmationRequiredError,
  pauseWorkflow,
  resumeWorkflow,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import type { WorkflowListItem } from "@/contracts/workflow";
import { WorkflowActivateConfirmDialog } from "./WorkflowActivateConfirmDialog";

/**
 * Inline status on/off toggle for a workflows-list row/card
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * **Non-optimistic.** The Switch's `checked` is fully controlled by the
 * incoming workflow data — it does NOT flip until the API succeeds and the
 * parent `onChanged()` triggers a refresh. During the call the Switch is
 * disabled (showing a pending visual via `data-pending`). On failure NOTHING
 * is reverted because nothing was ever optimistically changed.
 *
 * Action by state (uses existing lifecycle APIs only — no faked ops):
 *   - `active`              → pauseWorkflow
 *   - `paused`              → resumeWorkflow
 *   - `eligible_to_resume`  → resumeWorkflow
 *   - `draft`               → activateWorkflow (may trigger CONFIRMATION_REQUIRED)
 *   - `disabled`            → toggle disabled; user opens the builder to fix
 *
 * On `CONFIRMATION_REQUIRED` from activate → renders
 * `WorkflowActivateConfirmDialog` (typed confirmation phrase). On other
 * lifecycle errors (e.g. `MISSING_PRECONDITIONS`, `INVALID_TRANSITION`) →
 * surfaces the message inline + an "Open builder" link so the user is never
 * trapped on this page.
 */
interface Props {
  workflow: Pick<WorkflowListItem, "id" | "name" | "state" | "disabledReason">;
  onChanged: () => void;
}

export function WorkflowStatusToggle({ workflow, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDetail, setConfirmDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);

  const checked = workflow.state === "active";
  const cannotToggle = workflow.state === "disabled";

  async function handleToggle() {
    if (pending || cannotToggle) return;
    setPending(true);
    setError(null);
    try {
      if (workflow.state === "active") {
        await pauseWorkflow(workflow.id);
      } else if (
        workflow.state === "paused" ||
        workflow.state === "eligible_to_resume"
      ) {
        await resumeWorkflow(workflow.id);
      } else {
        // draft → activate (may require confirmation)
        await activateWorkflow(workflow.id);
      }
      onChanged();
    } catch (err) {
      if (isConfirmationRequiredError(err)) {
        // Open the typed-confirmation dialog; status stays unchanged until
        // the user confirms + the retry succeeds.
        setConfirmDetail(err.detail);
      } else if (err instanceof WorkflowApiError) {
        setError(err.message);
      } else {
        setError("Couldn't update the workflow. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid="workflow-status-toggle"
      data-state={workflow.state}
      data-pending={pending ? "true" : "false"}
      className="flex flex-col items-end gap-1"
    >
      <Switch
        data-testid="workflow-status-toggle-switch"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={pending || cannotToggle}
        aria-label={
          checked
            ? `Pause workflow ${workflow.name}`
            : cannotToggle
            ? `${workflow.name} is disabled — open the builder to recover`
            : `Activate workflow ${workflow.name}`
        }
      />
      {cannotToggle && (
        // A disabled workflow can't be re-enabled from the inert switch — recovery
        // (Reactivate → Resume) lives in the builder. Surface that direction visibly,
        // not just in the switch's aria-label. (handleToggle no-ops for disabled, so
        // `error` is never set here — this and the error block never co-render.)
        <Link
          href={`/workflows/${workflow.id}`}
          data-testid="workflow-status-toggle-reactivate"
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          Open builder to reactivate
        </Link>
      )}
      {error && (
        <div
          role="alert"
          data-testid="workflow-status-toggle-error"
          className="flex flex-col items-end gap-1 text-right text-[11px] text-destructive"
        >
          <span>{error}</span>
          <Link
            href={`/workflows/${workflow.id}`}
            data-testid="workflow-status-toggle-open-builder"
            className="underline"
          >
            Open builder
          </Link>
        </div>
      )}
      {confirmDetail && (
        <WorkflowActivateConfirmDialog
          workflowId={workflow.id}
          workflowName={workflow.name}
          detail={confirmDetail}
          onConfirmed={() => {
            setConfirmDetail(null);
            onChanged();
          }}
          onCancel={() => setConfirmDetail(null)}
        />
      )}
    </div>
  );
}
