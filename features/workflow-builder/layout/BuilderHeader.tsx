"use client";

import { useCallback, useState } from "react";
import { useGraphSlice } from "../state/graphSlice";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";

interface Props {
  workflowName: string;
}

type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "idle";

/**
 * Builder header (Slice 4.BUILDER-UI-SHELL-1).
 *
 * 48px compact strip that owns workflow identity (read-only name) and the
 * save status pill + Save button, lifted out of the previous footer row.
 * Wires Cmd/Ctrl+S to the same save action.
 *
 * Intentionally NOT in this slice (see follow-up slices in the port plan):
 *   - LifecycleActions stays in the page header (BUILDER-RUN-PANEL-1 / a
 *     dedicated lifecycle-move slice).
 *   - Test / Run / Publish controls (BUILDER-RUN-PANEL-1).
 *   - History pill + ValidationSummary pill (BUILDER-VALIDATION-1).
 *   - AI panel toggle (BUILDER-AI-PANEL-1).
 *   - Undo / redo (requires slice support that does not exist yet).
 *
 * The header reads save state straight from the graph slice — same pattern
 * `LifecycleActions` already uses — so it composes anywhere inside a
 * mounted builder without prop threading.
 */
export function BuilderHeader({ workflowName }: Props) {
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);
  const saveError = useGraphSlice((s) => s.saveError);
  const save = useGraphSlice((s) => s.save);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    try {
      await save();
      setSavedAt(Date.now());
    } catch {
      // Error already captured into slice.saveError; no extra UI work here.
    }
  }, [isDirty, isSaving, save]);

  useBuilderShortcuts({ onSave: handleSave });

  const status = deriveStatus({ isDirty, isSaving, saveError, savedAt });

  return (
    <header
      aria-label="Workflow builder header"
      className="flex h-12 items-center justify-between gap-3 border-b border-border px-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="truncate text-sm font-semibold" title={workflowName}>
          {workflowName}
        </h2>
        <StatusPill status={status} saveError={saveError} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </header>
  );
}

function deriveStatus(input: {
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  savedAt: number | null;
}): SaveStatus {
  if (input.isSaving) return "saving";
  if (input.saveError) return "error";
  if (input.isDirty) return "unsaved";
  if (input.savedAt !== null) return "saved";
  return "idle";
}

function StatusPill({
  status,
  saveError,
}: {
  status: SaveStatus;
  saveError: string | null;
}) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span
        role="alert"
        className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
      >
        {saveError ?? "Save failed."}
      </span>
    );
  }
  const label = STATUS_LABEL[status];
  const className = STATUS_CLASSES[status];
  return (
    <span
      data-status={status}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<Exclude<SaveStatus, "idle" | "error">, string> = {
  saving: "Saving…",
  unsaved: "Unsaved changes",
  saved: "Saved.",
};

const STATUS_CLASSES: Record<Exclude<SaveStatus, "idle" | "error">, string> = {
  saving:
    "border border-blue-300/40 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300",
  unsaved:
    "border border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300",
  saved:
    "border border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};
