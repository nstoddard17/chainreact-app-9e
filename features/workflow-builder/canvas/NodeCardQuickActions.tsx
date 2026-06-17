"use client";

import type { ReactNode } from "react";

/**
 * Slice 4.BUILDER-NODE-QUICK-ACTIONS-1 — the top-right icon cluster on a node
 * card for direct rename / delete without opening the config panel. Extracted
 * from `WorkflowNodeCard` so the card stays under the line cap.
 *
 * Each button stops click propagation so it never selects/opens the node, and
 * carries `nodrag` so a click-drag on it doesn't drag the node. Labels use
 * "step" — never a raw id. Buttons render only when their handler is wired
 * (delete is action-only; the card decides `canDelete`).
 */
export function NodeQuickActions({
  canRename,
  canDelete,
  onRename,
  onDelete,
}: {
  canRename: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  if (!canRename && !canDelete) return null;
  return (
    <div
      data-testid="node-quick-actions"
      className="nodrag absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100"
    >
      {canRename ? (
        <QuickActionButton testId="node-quick-rename" label="Rename step" onClick={onRename}>
          <PencilIcon />
        </QuickActionButton>
      ) : null}
      {canDelete ? (
        <QuickActionButton testId="node-quick-delete" label="Delete step" onClick={onDelete}>
          <TrashIcon />
        </QuickActionButton>
      ) : null}
    </div>
  );
}

function QuickActionButton({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // Never let the click bubble to the node (which would open config).
        event.stopPropagation();
        onClick();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className="nodrag inline-flex h-5 w-5 items-center justify-center rounded-[3px]"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
