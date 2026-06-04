"use client";

/**
 * Undo snackbar shown after a soft-delete (Slice 4.WF-5). Wired to the
 * delete_operation_id the delete returned — "Undo" restores the item before the
 * 7-day window elapses. Auto-dismiss is owned by the parent.
 */
interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  pending?: boolean;
}

export function WorkflowsUndoToast({ message, onUndo, onDismiss, pending }: Props) {
  return (
    <div
      role="status"
      data-testid="workflows-undo-toast"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-xl"
    >
      <span className="text-sm text-foreground">{message}</span>
      <button
        type="button"
        data-testid="workflows-undo-button"
        onClick={onUndo}
        disabled={pending}
        className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="workflows-undo-dismiss"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
