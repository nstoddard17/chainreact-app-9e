"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { WorkflowConfirmationRequiredDetail } from "@/lib/api/workflows";

/**
 * Slice 3.POSTSEC-5 — typed-confirmation modal for destructive /
 * money-moving workflow actions.
 *
 * Renders when the server returns `409 CONFIRMATION_REQUIRED` from
 * `activateWorkflow` / `runNowWorkflow`. The caller passes the
 * server-issued `detail` (the structured payload from
 * `WorkflowConfirmationRequiredError.detail`) verbatim; the modal
 * never recomputes the action list, never reads workflow definition,
 * and never displays node config / IDs / resolved values.
 *
 * Generic by design — not Stripe-only. Used for any SEC-4B
 * confirmation-gated workflow: gmail:delete_email, slack:delete_message,
 * notion:archive_page, all the destructive + POSTSEC-3 money-moving
 * Stripe actions. The same modal renders regardless of which provider
 * tripped the gate.
 *
 * UX rules:
 *   - Title: "Confirmation required"
 *   - Body: generic billing/external-service warning. Does NOT name the
 *     provider in the body — the per-action list below does.
 *   - Action list: one row per `detail.actions[]` entry showing
 *     displayName + `provider:type` + riskDescription (when present).
 *   - Required phrase: the server-issued `detail.confirmationText`.
 *     V1 = `"CONFIRM"`. UIs MUST NOT hardcode the phrase — read it
 *     from `detail`.
 *   - Confirm button stays disabled until the user types the exact
 *     phrase (case-sensitive; trimmed for paste-friendliness — matches
 *     `services/workflows/riskConfirmation.ts:isValidConfirmationText`).
 *   - Cancel returns control without retrying; the caller clears
 *     pending state.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"` + labelled by the title.
 *   - The input is the initial focus target on mount.
 *   - Escape key is handled by the caller via `onCancel` (Slice
 *     follow-up: wire a global escape listener if needed).
 */

export interface DestructiveActionConfirmationModalProps {
  /** Server-issued confirmation detail. */
  detail: WorkflowConfirmationRequiredDetail;
  /**
   * Called when the user types the correct phrase and clicks Confirm.
   * The caller is responsible for retrying the original operation
   * (`activateWorkflow` / `runNowWorkflow`) with
   * `confirmationText: detail.confirmationText`.
   */
  onConfirm: () => void;
  /** Called when the user cancels — the caller should clear pending state. */
  onCancel: () => void;
  /**
   * Disable the Confirm button while the retry is in flight to prevent
   * double-submit. The caller flips this on/off around the retry call.
   */
  busy?: boolean;
  /**
   * Optional override for the modal title. Defaults to "Confirmation
   * required". Tests can override; production callers shouldn't.
   */
  title?: string;
}

export function DestructiveActionConfirmationModal({
  detail,
  onConfirm,
  onCancel,
  busy = false,
  title = "Confirmation required",
}: DestructiveActionConfirmationModalProps): React.ReactElement {
  const [typed, setTyped] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Initial-focus management — moves keyboard focus to the input on
  // open so screen readers and keyboard-only users land in the right
  // place without clicking through.
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Match the server's `isValidConfirmationText` exactly — trimmed +
  // case-sensitive compare against the issued phrase. Keeps client +
  // server validation in lockstep.
  const isValid = typed.trim() === detail.confirmationText;

  function handleConfirm(): void {
    if (!isValid || busy) return;
    onConfirm();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const titleId = "destructive-action-confirmation-title";
  const bodyId = "destructive-action-confirmation-body";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="destructive-action-confirmation-modal"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-input bg-card p-6 shadow-lg"
      >
        <header className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p id={bodyId} className="text-sm text-muted-foreground">
            This workflow contains actions that can change external services or
            affect billing. Review the actions below, then type{" "}
            <code className="font-mono">{detail.confirmationText}</code> to
            continue.
          </p>
        </header>

        <ul
          aria-label="Actions requiring confirmation"
          data-testid="destructive-action-confirmation-actions"
          className="flex flex-col gap-2"
        >
          {detail.actions.map((action) => {
            const key = `${action.nodeId}-${action.provider}:${action.type}`;
            return (
              <li
                key={key}
                data-testid={`destructive-action-${action.nodeId}`}
                className="flex flex-col gap-1 rounded border border-input bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {action.displayName}
                  </span>
                  <code className="text-xs text-muted-foreground">
                    {action.provider}:{action.type}
                  </code>
                </div>
                {action.riskDescription ? (
                  <p className="text-xs text-muted-foreground">
                    {action.riskDescription}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">
            Type <code className="font-mono">{detail.confirmationText}</code> to
            continue
          </span>
          <input
            ref={inputRef}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="destructive-action-confirmation-input"
            aria-label={`Type ${detail.confirmationText} to confirm`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <footer className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            data-testid="destructive-action-confirmation-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || busy}
            data-testid="destructive-action-confirmation-confirm"
          >
            {busy ? "Working…" : "Confirm and continue"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
