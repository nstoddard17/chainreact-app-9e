"use client";

import type { ReactNode } from "react";

/**
 * Document Builder — top-level multi-selection toolbar (5.DUAL-BUILDER-1 / CS-6).
 *
 * Only SAFE actions surface: group steps (CS-4 presentation sections), duplicate an ordinary
 * action, confirmed delete, and limited adjacent-linear move. Duplicate/move are
 * single-selection only (they operate on one canonical node); wrap needs a
 * contiguous top-level range. Every action delegates to the injected command
 * handler, which refuses unsafe gestures with a typed reason. Presentational.
 */
export function DocumentSelectionToolbar({
  count,
  singleActionable,
  onWrap,
  onDuplicate,
  onDelete,
  onMoveEarlier,
  onMoveLater,
  onClear,
}: {
  count: number;
  /** True when exactly one ordinary action is selected (duplicate/move eligible). */
  singleActionable: boolean;
  onWrap: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      data-testid="document-selection-toolbar"
      className="sticky top-2 z-10 mx-auto mb-3 flex w-fit items-center gap-1 rounded-full px-2 py-1.5"
      style={{
        background: "var(--builder-text)",
        color: "var(--builder-panel)",
        boxShadow: "0 12px 30px -14px rgba(0,0,0,.5)",
      }}
    >
      <span className="px-2 text-[12px] font-semibold" data-testid="document-selection-count">
        {count} selected
      </span>
      <ToolbarButton testId="document-selection-wrap" onClick={onWrap}>
        Group steps
      </ToolbarButton>
      <ToolbarButton testId="document-selection-duplicate" onClick={onDuplicate} disabled={!singleActionable}>
        Duplicate
      </ToolbarButton>
      <ToolbarButton testId="document-selection-move-earlier" onClick={onMoveEarlier} disabled={!singleActionable}>
        ↑ Earlier
      </ToolbarButton>
      <ToolbarButton testId="document-selection-move-later" onClick={onMoveLater} disabled={!singleActionable}>
        ↓ Later
      </ToolbarButton>
      <ToolbarButton testId="document-selection-delete" onClick={onDelete}>
        Delete
      </ToolbarButton>
      <button
        type="button"
        data-testid="document-selection-clear"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px]"
        style={{ color: "var(--builder-panel)" }}
      >
        ✕
      </button>
    </div>
  );
}

function ToolbarButton({
  testId,
  onClick,
  disabled,
  children,
}: {
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium disabled:opacity-40"
      style={{ background: "transparent", color: "var(--builder-panel)" }}
    >
      {children}
    </button>
  );
}
