"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activateWorkflow,
  isConfirmationRequiredError,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";

/**
 * Activation confirmation dialog for the workflows dashboard
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Opened by `WorkflowStatusToggle` when `activateWorkflow` returns
 * `CONFIRMATION_REQUIRED` (Slice 3.POSTSEC-5). Lists the destructive
 * `detail.actions[]` the server flagged and asks the user to echo the
 * server-provided `detail.confirmationText` verbatim, then retries
 * `activateWorkflow(id, { confirmationText })`.
 *
 * Non-trapping on readiness failure: if the retry returns a non-CONFIRMATION
 * lifecycle error (e.g. `MISSING_PRECONDITIONS` / `INVALID_TRANSITION`), we
 * show the message + an "Open builder" escape hatch instead of silently
 * leaving the user stuck. Status NEVER flips on the parent until the API
 * actually succeeds (non-optimistic; see `WorkflowStatusToggle`).
 *
 * Minimal app-theme modal (no Dialog primitive exists yet in components/ui);
 * Esc + backdrop close. A future shared Dialog can replace this without
 * touching the toggle's contract.
 */
interface Props {
  workflowId: string;
  workflowName: string;
  detail: WorkflowConfirmationRequiredDetail;
  onConfirmed: () => void;
  onCancel: () => void;
}

export function WorkflowActivateConfirmDialog({
  workflowId,
  workflowName,
  detail,
  onConfirmed,
  onCancel,
}: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phrase = detail.confirmationText;
  const matches = typed === phrase;
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, pending]);

  async function handleConfirm() {
    if (!matches || pending) return;
    setPending(true);
    setError(null);
    try {
      await activateWorkflow(workflowId, { confirmationText: phrase });
      onConfirmed();
    } catch (err) {
      if (isConfirmationRequiredError(err)) {
        // Server raised the gate again (e.g. plan changed mid-dialog) — keep
        // the user in the dialog with the latest message.
        setError(err.message);
      } else if (err instanceof WorkflowApiError) {
        setError(err.message);
      } else {
        setError("Couldn't activate. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  function openBuilder() {
    router.push(`/workflows/${workflowId}`);
  }

  return (
    <div
      data-testid="workflow-activate-confirm-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        data-testid="workflow-activate-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-activate-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg"
      >
        <h2
          id="workflow-activate-confirm-title"
          className="text-base font-semibold text-foreground"
        >
          Confirm activation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Activating <span className="font-medium text-foreground">{workflowName}</span>{" "}
          enables one or more high-risk actions:
        </p>
        <ul
          data-testid="workflow-activate-confirm-actions"
          className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground"
        >
          {detail.actions.map((a) => (
            <li key={a.nodeId}>
              <span className="font-medium">{a.displayName}</span>{" "}
              <span className="text-xs text-muted-foreground">
                ({a.provider} · {a.type})
              </span>
              {a.riskDescription && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.riskDescription}
                </p>
              )}
            </li>
          ))}
        </ul>

        <label
          htmlFor="workflow-activate-confirm-input"
          className="mt-4 block text-xs font-medium text-foreground"
        >
          Type{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
            {phrase}
          </code>{" "}
          to confirm.
        </label>
        <Input
          id="workflow-activate-confirm-input"
          data-testid="workflow-activate-confirm-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={pending}
          autoComplete="off"
          className="mt-1.5"
        />

        {error && (
          <div
            role="alert"
            data-testid="workflow-activate-confirm-error"
            className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
          >
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openBuilder}
              data-testid="workflow-activate-confirm-open-builder"
              className="mt-2"
            >
              Open builder
            </Button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
            data-testid="workflow-activate-confirm-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!matches || pending}
            data-testid="workflow-activate-confirm-submit"
          >
            {pending ? "Activating…" : "Confirm & activate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
