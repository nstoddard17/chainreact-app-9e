"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkflowState } from "@/contracts/workflow";
import {
  WorkflowApiError,
  activateWorkflow,
  isConfirmationRequiredError,
  pauseWorkflow,
  publishWorkflow,
  reactivateWorkflow,
  resumeWorkflow,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { DestructiveActionConfirmationModal } from "./DestructiveActionConfirmationModal";

interface Props {
  workflowId: string;
  state: WorkflowState;
  /**
   * BUILDER-READINESS — number of blocking validation errors (missing required
   * fields, no trigger, unconfigured nodes, invalid router routes). When > 0,
   * the go-live transitions (Activate / Resume) are disabled so an incomplete
   * workflow can't be put into production. Pause / Reactivate are unaffected.
   */
  blockingIssueCount?: number;
  /**
   * V2-READY-41G — true when this ACTIVE workflow has draft changes not yet in
   * its live (published) active revision. Server-computed; only ever true when
   * active-revision execution is the real runtime behavior (otherwise the draft
   * is already live, so there's nothing to publish). Drives the "Unpublished
   * changes" chip + "Publish changes" button.
   */
  unpublishedChanges?: boolean;
}

type ActionKind = "activate" | "pause" | "resume" | "reactivate" | "publish";

interface Action {
  kind: ActionKind;
  label: string;
  variant: "primary" | "secondary";
}

function actionsForState(state: WorkflowState): readonly Action[] {
  switch (state) {
    case "draft":
      return [{ kind: "activate", label: "Activate", variant: "primary" }];
    case "active":
      return [{ kind: "pause", label: "Pause", variant: "secondary" }];
    case "paused":
      return [{ kind: "resume", label: "Resume", variant: "primary" }];
    case "eligible_to_resume":
      return [{ kind: "resume", label: "Resume", variant: "primary" }];
    case "disabled":
      // Recover a disabled workflow: "Reactivate" runs the markEligibleToResume
      // transition (disabled -> eligible_to_resume); the Resume action that then
      // appears runs activation preconditions + re-registers triggers off the
      // current draft. The reconnect path lives on the node config / integrations.
      return [{ kind: "reactivate", label: "Reactivate", variant: "primary" }];
    case "deleted":
      return [];
  }
}

/**
 * Wires the lifecycle action endpoints to the detail-page header.
 *
 * Per workflow-builder-ui.md / project-structure-and-module-boundaries.md §4-5:
 *   - No fetch in components — typed client API only.
 *   - On success the page re-fetches via router.refresh() so the status
 *     badge + the available actions update.
 *
 * Slice 3.POSTSEC-5 — activation routes through the destructive-action
 * confirmation modal when the server returns
 * `WorkflowConfirmationRequiredError`. Pause / resume are NOT gated by
 * SEC-4B (the route's risk check fires only on activate / run-now), so
 * they go straight through to the typed client without the modal.
 */
export function LifecycleActions({
  workflowId,
  state,
  blockingIssueCount = 0,
  unpublishedChanges = false,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Slice 3.POSTSEC-5 — pending confirmation state for the activate path.
  // Holds the server-issued detail; non-null = modal is open.
  const [confirmationDetail, setConfirmationDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);
  // Read dirty state straight from the graph slice — the lifecycle header
  // and the builder share one Zustand store, so no prop threading is needed.
  // Initial render sees isDirty=false (slice INITIAL_STATE); edits flip it.
  const hasUnsavedChanges = useGraphSlice((s) => s.isDirty);

  const actions = actionsForState(state);
  if (actions.length === 0) return null;

  async function runKind(
    kind: ActionKind,
    confirmationText: string | undefined,
  ): Promise<void> {
    if (kind === "activate") {
      await activateWorkflow(workflowId, { confirmationText });
      return;
    }
    if (kind === "pause") {
      await pauseWorkflow(workflowId);
      return;
    }
    if (kind === "reactivate") {
      await reactivateWorkflow(workflowId);
      return;
    }
    if (kind === "publish") {
      await publishWorkflow(workflowId);
      return;
    }
    await resumeWorkflow(workflowId);
  }

  async function run(kind: ActionKind) {
    if (pending !== null) return;
    if (confirmationDetail !== null) return;
    setPending(kind);
    setError(null);
    try {
      await runKind(kind, undefined);
      router.refresh();
    } catch (err) {
      // Slice 3.POSTSEC-5 — first-shot CONFIRMATION_REQUIRED branches
      // into the modal flow. Clear the "pending" spinner state so the
      // user isn't staring at an "Activating…" button while reading the
      // modal; re-set it during the actual retry.
      if (kind === "activate" && isConfirmationRequiredError(err)) {
        setConfirmationDetail(err.detail);
        setPending(null);
        return;
      }
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : `Failed to ${kind} workflow.`;
      setError(message);
      setPending(null);
      return;
    }
    setPending(null);
  }

  async function handleConfirmActivate(): Promise<void> {
    if (!confirmationDetail) return;
    // Re-enter the in-flight state for the retry. The modal's `busy`
    // prop reads this and disables both Cancel + Confirm to prevent
    // double-submit.
    setPending("activate");
    try {
      await activateWorkflow(workflowId, {
        confirmationText: confirmationDetail.confirmationText,
      });
      setConfirmationDetail(null);
      router.refresh();
    } catch (err) {
      // Defensive — if the server STILL returns CONFIRMATION_REQUIRED on
      // the retry (e.g. the typed phrase didn't match server-side
      // validation, somehow), surface as an error and close the modal so
      // the user isn't stuck in a loop. The modal's own validation
      // mirrors the server's, so this branch is rare.
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : `Failed to activate workflow.`;
      setError(message);
      setConfirmationDetail(null);
    } finally {
      setPending(null);
    }
  }

  function handleCancelConfirm(): void {
    setConfirmationDetail(null);
  }

  // V2-READY-41G — Publish is blocked by the same conditions as the other
  // lifecycle actions; additionally it requires saved changes because it
  // snapshots the PERSISTED draft (unsaved in-memory edits aren't on the server).
  const publishDisabled =
    pending !== null || hasUnsavedChanges || confirmationDetail !== null;

  return (
    <div className="flex flex-col items-end gap-1" aria-label="Lifecycle actions">
      {state === "active" && unpublishedChanges ? (
        <div className="flex items-center gap-2">
          <span
            data-testid="unpublished-changes-chip"
            className="rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300"
          >
            Unpublished changes
          </span>
          <button
            type="button"
            data-testid="publish-changes-button"
            onClick={() => run("publish")}
            disabled={publishDisabled}
            title={
              hasUnsavedChanges
                ? "Save your changes before publishing."
                : "Make the current draft the live version."
            }
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending === "publish" ? "Publishing…" : "Publish changes"}
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        {actions.map((action) => {
          // BUILDER-READINESS — block go-live transitions while the workflow has
          // unresolved validation errors. Pause / Reactivate are not go-live and
          // stay available.
          const isGoLive = action.kind === "activate" || action.kind === "resume";
          const blockedByValidation = isGoLive && blockingIssueCount > 0;
          const disabled =
            pending !== null ||
            hasUnsavedChanges ||
            confirmationDetail !== null ||
            blockedByValidation;
          const baseClasses =
            "rounded px-3 py-1.5 text-sm font-medium disabled:opacity-60";
          const variantClasses =
            action.variant === "primary"
              ? "bg-primary text-primary-foreground"
              : "border border-input";
          return (
            <button
              key={action.kind}
              type="button"
              onClick={() => run(action.kind)}
              disabled={disabled}
              data-blocked-by-validation={blockedByValidation ? "true" : undefined}
              title={
                blockedByValidation
                  ? `Resolve ${blockingIssueCount} setup ${blockingIssueCount === 1 ? "issue" : "issues"} before ${action.label.toLowerCase()} — open the validation panel.`
                  : hasUnsavedChanges
                    ? "Save your changes before changing lifecycle state."
                    : undefined
              }
              className={`${baseClasses} ${variantClasses}`}
            >
              {pending === action.kind ? `${action.label}…` : action.label}
            </button>
          );
        })}
      </div>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      {confirmationDetail && (
        <DestructiveActionConfirmationModal
          detail={confirmationDetail}
          busy={pending === "activate"}
          onConfirm={handleConfirmActivate}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
}
