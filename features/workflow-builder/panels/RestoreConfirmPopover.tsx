"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * AGENT-CHANGE-HISTORY-1 — restore confirmation as a POPOVER (not an inline card).
 *
 * Replaces the old inline-confirm card that shifted layout. The Radix popover is
 * portalled, so opening it never reflows the timeline row. Confirm calls
 * `onConfirm` (the builder's checkpoint-restore handler, which re-hydrates the
 * graph). The popover stays open while restoring so it can show progress / a
 * restore error for the row the user acted on.
 */
export function RestoreConfirmPopover({
  isDirty,
  restoring,
  restoreError,
  onConfirm,
}: {
  readonly isDirty: boolean;
  readonly restoring: boolean;
  readonly restoreError: string | null;
  readonly onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAttempted(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="history-restore-trigger"
          className="rounded px-2 py-1 text-[12px]"
          style={{ border: "1px solid var(--builder-border)", color: "var(--builder-text)" }}
        >
          Restore
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="history-restore-popover"
        className="w-72 p-3 text-[12px]"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
        }}
      >
        <p style={{ color: "var(--builder-muted)" }}>
          Restore this checkpoint? It replaces your current draft.
          {isDirty ? " Your unsaved changes will be discarded." : ""}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-testid="history-restore-confirm"
            disabled={restoring}
            onClick={() => {
              setAttempted(true);
              onConfirm();
            }}
            className="rounded px-2 py-1 text-[12px] font-medium disabled:opacity-60"
            style={{ background: "var(--builder-accent, #0284c7)", color: "#fff" }}
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
          <button
            type="button"
            data-testid="history-restore-cancel"
            disabled={restoring}
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-[12px] disabled:opacity-60"
            style={{ border: "1px solid var(--builder-border)" }}
          >
            Cancel
          </button>
        </div>
        {attempted && restoreError ? (
          <p
            data-testid="history-restore-error"
            className="mt-1.5"
            style={{ color: "var(--builder-danger, #dc2626)" }}
          >
            {restoreError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
