"use client";

import { useCallback, useState } from "react";
import { useGraphSlice } from "../state/graphSlice";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
} from "../validation/collectBuilderValidationIssues";
import { HeaderRunControls } from "./HeaderRunControls";

interface Props {
  workflowName: string;
  /**
   * Left React Agent rail state. When supplied, the header renders a
   * collapse/expand toggle on the left side of the action area. The
   * toggle is purely a presentational lever — the parent owns the
   * actual state via `useLeftAgentRail`. Slice 4.BUILDER-LEFT-AGENT-1.
   *
   * Optional so the SHELL-1 unit tests (which render BuilderHeader in
   * isolation with no rail context) keep passing unchanged.
   */
  leftRail?: {
    isCollapsed: boolean;
    onToggle: () => void;
  };
  /**
   * Validation pill state. When supplied, the header renders a small
   * pill showing the current error/warning count or a "Ready" pill
   * when the graph is clean. Clicking the pill fires `onOpen` — the
   * parent flips the right drawer mode to `validation`. Slice 4.
   * BUILDER-VALIDATION-1.
   *
   * Optional so the SHELL-1 / LEFT-AGENT-1 unit tests that render
   * BuilderHeader in isolation keep passing unchanged.
   */
  validation?: {
    onOpen: () => void;
  };
}

type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "idle";

/**
 * Builder header (Slice 4.BUILDER-UI-SHELL-1, extended in
 * Slice 4.BUILDER-LEFT-AGENT-1).
 *
 * 48px compact strip that owns workflow identity (read-only name), the
 * save status pill + Save button, the header run controls (Test / Run),
 * and the React Agent left-rail toggle. Wires Cmd/Ctrl+S to the same
 * save action.
 *
 * Intentionally NOT in this slice (see follow-up slices in the port plan):
 *   - LifecycleActions stays in the page header (a dedicated
 *     lifecycle-move slice).
 *   - History pill + ValidationSummary pill (BUILDER-VALIDATION-1).
 *   - Undo / redo (requires slice support that does not exist yet).
 *
 * The header reads save state straight from the graph slice — same pattern
 * `LifecycleActions` already uses — so it composes anywhere inside a
 * mounted builder without prop threading.
 */
export function BuilderHeader({ workflowName, leftRail, validation }: Props) {
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);
  const saveError = useGraphSlice((s) => s.saveError);
  const save = useGraphSlice((s) => s.save);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Slice 4.BUILDER-VALIDATION-1 — validation pill counts are derived
  // from the same pure helper the ValidationSummary drawer body uses,
  // so the pill count and the drawer list never disagree.
  const validationCounts = validation
    ? countBuilderValidationIssues(
        collectBuilderValidationIssues({ pendingNodes, pendingEdges }),
      )
    : null;

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
        {leftRail ? (
          <LeftRailToggle
            isCollapsed={leftRail.isCollapsed}
            onToggle={leftRail.onToggle}
          />
        ) : null}
        <h2 className="truncate text-sm font-semibold" title={workflowName}>
          {workflowName}
        </h2>
        <StatusPill status={status} saveError={saveError} />
      </div>
      <div className="flex items-center gap-2">
        {validation && validationCounts ? (
          <HeaderValidationPill
            counts={validationCounts}
            onOpen={validation.onOpen}
          />
        ) : null}
        <HeaderRunControls />
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

function HeaderValidationPill({
  counts,
  onOpen,
}: {
  counts: { errorCount: number; warningCount: number; totalCount: number };
  onOpen: () => void;
}) {
  const { errorCount, warningCount, totalCount } = counts;
  const state: "ready" | "warning" | "error" =
    errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ready";
  const label =
    state === "ready"
      ? "Ready"
      : `${totalCount} ${totalCount === 1 ? "issue" : "issues"}`;
  const className =
    state === "error"
      ? "border border-destructive/40 bg-destructive/10 text-destructive"
      : state === "warning"
        ? "border border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300"
        : "border border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open validation summary"
      data-testid="builder-header-validation-pill"
      data-state={state}
      data-error-count={errorCount}
      data-warning-count={warningCount}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      title="Open validation summary"
    >
      {label}
    </button>
  );
}

function LeftRailToggle({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const label = isCollapsed ? "Expand React Agent" : "Collapse React Agent";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={!isCollapsed}
      data-testid="builder-header-left-rail-toggle"
      data-collapsed={isCollapsed ? "true" : "false"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-input text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      title={label}
    >
      <span aria-hidden>{isCollapsed ? "›" : "‹"}</span>
    </button>
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
