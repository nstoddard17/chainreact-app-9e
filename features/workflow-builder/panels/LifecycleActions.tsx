"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkflowState } from "@/contracts/workflow";
import {
  WorkflowApiError,
  activateWorkflow,
  isConfirmationRequiredError,
  pauseWorkflow,
  resumeWorkflow,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { DestructiveActionConfirmationModal } from "./DestructiveActionConfirmationModal";

interface Props {
  workflowId: string;
  state: WorkflowState;
}

type ActionKind = "activate" | "pause" | "resume";

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
      // System-disabled workflows surface a reconnect path elsewhere
      // (Slice 1J+ wires that to the integrations page).
      return [];
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
export function LifecycleActions({ workflowId, state }: Props) {
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

  return (
    <div className="flex flex-col items-end gap-1" aria-label="Lifecycle actions">
      <div className="flex gap-2">
        {actions.map((action) => {
          const disabled =
            pending !== null || hasUnsavedChanges || confirmationDetail !== null;
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
              title={
                hasUnsavedChanges
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
