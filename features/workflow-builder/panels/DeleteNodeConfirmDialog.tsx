"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { WorkflowNode } from "@/contracts/workflow";
import type { DeleteNodeFromGraphResult } from "../utils/deleteNodeFromGraph";

/**
 * Slice 4.BUILDER-NODE-DELETE-1 — confirmation dialog for the inspector's
 * "Delete node" button. Slice 4.BUILDER-NODE-DELETE-2 extended with an
 * optional `multiSelectCount` prop the canvas keyboard-delete path uses
 * when the user selects 2+ nodes (blocked v1 — "select one at a time").
 *
 * Three rendering modes:
 *
 *   1. **Multi-select blocked** (`multiSelectCount` set + > 1) — wins over
 *      single-node mode. Shows a "Delete N nodes?" title + body explaining
 *      that v1 supports one-at-a-time deletion. Single Close button. No
 *      Confirm. `node` / `preview` / `onConfirm` props are ignored in this
 *      mode (still accepted so the API stays uniform — callers always
 *      pass a `preview`/`node` even when adding `multiSelectCount`).
 *
 *   2. **Single-node blocked** (`preview.ok === false`) — informational.
 *      Renders the blocked reason / message and offers a single "Close"
 *      button. No Confirm. The user cannot force-delete a multi-edge node
 *      from here; they must disconnect manually first.
 *
 *   3. **Single-node allowed** (`preview.ok === true`) — Cancel + Delete
 *      buttons. Copy adapts to the node kind + rewire / drop / standalone
 *      / warning sub-cases (trigger, action with rewire, action without
 *      rewire, action with self-loop or duplicate warning).
 *
 * Deliberately lighter than `DestructiveActionConfirmationModal` (no
 * type-the-phrase echo) — Q11-style server-side high-risk surfaces are
 * scoped to provider actions, not graph-level deletes. The graph delete
 * is fully reversible client-side (the user just hasn't saved yet —
 * navigating away or clicking Cancel on the next save dialog rolls back).
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal="true"` + labelled-by title id.
 *   - Initial focus moves to the Confirm button when allowed; to the
 *     Close button when blocked (single-node OR multi-select).
 *   - Escape closes via the parent's `onCancel`.
 */

export interface DeleteNodeConfirmDialogProps {
  /**
   * The node being targeted. Pulled from graphSlice by the caller. Ignored
   * when `multiSelectCount` is set (the multi-select view doesn't render
   * any per-node detail).
   */
  node?: WorkflowNode;
  /**
   * Output of `deleteNodeFromGraph` called on the current pending state.
   * Drives the dialog content. Required for single-node modes; ignored
   * when `multiSelectCount` is set.
   */
  preview?: DeleteNodeFromGraphResult;
  /**
   * Called when the user clicks the Delete button in the single-node
   * allowed mode. Ignored otherwise.
   */
  onConfirm?(): void;
  onCancel(): void;
  /** Disable the Confirm button while a parent-side action is in flight. */
  busy?: boolean;
  /**
   * Slice 4.BUILDER-NODE-DELETE-2 — when set and > 1, the dialog renders
   * a multi-select blocked view. The keyboard-delete path uses this so
   * selecting 2+ nodes and pressing Delete shows clear feedback instead
   * of either nothing happening or fanning out N rewires.
   */
  multiSelectCount?: number;
}

export function DeleteNodeConfirmDialog({
  node,
  preview,
  onConfirm,
  onCancel,
  busy = false,
  multiSelectCount,
}: DeleteNodeConfirmDialogProps): React.ReactElement {
  const confirmButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const isMultiBlocked =
    typeof multiSelectCount === "number" && multiSelectCount > 1;

  React.useEffect(() => {
    if (isMultiBlocked) {
      closeButtonRef.current?.focus();
      return;
    }
    if (preview?.ok) {
      confirmButtonRef.current?.focus();
    } else {
      closeButtonRef.current?.focus();
    }
  }, [isMultiBlocked, preview?.ok]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const titleId = "delete-node-confirm-title";
  const bodyId = "delete-node-confirm-body";
  const isTrigger = node?.kind === "trigger";
  const title = isMultiBlocked
    ? `Delete ${multiSelectCount} nodes?`
    : preview?.ok
      ? isTrigger
        ? "Delete trigger?"
        : "Delete action?"
      : "Can't delete this node yet";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="delete-node-confirm-dialog"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded border border-input bg-card p-6 shadow-lg">
        <header className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p
            id={bodyId}
            className="text-sm text-muted-foreground"
            data-testid="delete-node-confirm-body"
          >
            {renderBody({ node, preview, multiSelectCount })}
          </p>
        </header>

        <footer className="flex justify-end gap-2">
          {isMultiBlocked || !preview || !preview.ok ? (
            <Button
              ref={closeButtonRef}
              type="button"
              variant="outline"
              onClick={onCancel}
              data-testid="delete-node-confirm-close"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={busy}
                data-testid="delete-node-confirm-cancel"
              >
                Cancel
              </Button>
              <Button
                ref={confirmButtonRef}
                type="button"
                variant="destructive"
                onClick={onConfirm}
                disabled={busy}
                data-testid="delete-node-confirm-confirm"
              >
                {busy
                  ? "Deleting…"
                  : isTrigger
                    ? "Delete trigger"
                    : "Delete action"}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function renderBody({
  node,
  preview,
  multiSelectCount,
}: {
  node?: WorkflowNode;
  preview?: DeleteNodeFromGraphResult;
  multiSelectCount?: number;
}): React.ReactNode {
  if (typeof multiSelectCount === "number" && multiSelectCount > 1) {
    return (
      <span>
        You've selected {multiSelectCount} nodes. Delete one node at a time
        so we can safely rewire the surrounding edges and surface any nodes
        we can't auto-rewire.
      </span>
    );
  }

  if (!preview) {
    return null;
  }

  if (!preview.ok) {
    if (preview.reason === "cannot_rewire_multi_edge") {
      return (
        <span>
          This node connects to multiple paths. Remove the extra edges
          manually on the canvas, then try deleting it again.
        </span>
      );
    }
    return <span>{preview.message}</span>;
  }

  if (!node) {
    return null;
  }

  const droppedCount = preview.removedEdgeIds.length;
  const willRewire = preview.rewiredEdgeId !== null;
  const isTrigger = node.kind === "trigger";

  if (isTrigger) {
    return (
      <span>
        Your workflow will have no trigger until you add a replacement.
        {droppedCount > 0
          ? ` ${droppedCount} connected edge${droppedCount === 1 ? "" : "s"} will be removed.`
          : ""}
      </span>
    );
  }

  if (willRewire) {
    return (
      <span>
        The action and its two connected edges will be removed, and a new
        edge will be created to keep the chain connected.
        {preview.warning ? renderWarningHint(preview.warning) : null}
      </span>
    );
  }

  if (droppedCount > 0) {
    return (
      <span>
        This action and its {droppedCount} connected edge
        {droppedCount === 1 ? "" : "s"} will be removed.
        {preview.warning ? renderWarningHint(preview.warning) : null}
      </span>
    );
  }

  return <span>This action has no connected edges and will be removed.</span>;
}

function renderWarningHint(
  warning: NonNullable<
    Extract<DeleteNodeFromGraphResult, { ok: true }>["warning"]
  >,
): React.ReactNode {
  switch (warning) {
    case "rewire_would_self_loop":
      return (
        <>
          {" "}
          The chain currently loops through this node, so no rewire edge
          will be created.
        </>
      );
    case "rewire_would_duplicate":
      return (
        <>
          {" "}
          A direct connection between the surrounding nodes already exists,
          so no duplicate rewire edge will be created.
        </>
      );
    default:
      return null;
  }
}
