"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  cancelDocumentField,
  commitDocumentField,
  type DocumentCommandResult,
} from "./documentCommands";

/**
 * 5.DUAL-BUILDER-1 CS-2 — Guided Stop lifecycle over the SHARED stores.
 *
 * Opening a stop is `configSlice.openNode` (reuses any in-progress draft and
 * sets `activeNodeId`, which is what gives the re-hosted field renderers
 * their variable-picker sources and the top-bar undo/redo its existing
 * draft-resync behavior). WorkflowBuilder suppresses ONLY the automatic
 * inspector-drawer open for stop-driven selections (via `onActiveChange`);
 * everything else — draft identity, commit path, history sync — is the
 * inspector's own machinery.
 *
 * Close semantics:
 *   - commit → `commitDocumentField` (the inspector's exact local-commit
 *     path) then `closeNode`.
 *   - cancel → restore the open-time snapshot then `closeNode`. The draft
 *     itself is preserved (never dropped), matching inspector semantics.
 *   - external close → if undo/redo/another surface removes the node or
 *     steals the selection (`activeNodeId` changes away), the stop closes
 *     itself; historyNav's `resyncDraftFromConfig`/`closeNode` remain the
 *     authorities on what the draft looks like afterwards.
 */

export interface GuidedStopTarget {
  readonly nodeId: string;
  readonly fieldName: string;
  /** Draft values at open time — the Cancel/Escape restore point. */
  readonly snapshotValues: Readonly<Record<string, unknown>>;
}

export interface UseDocumentGuidedStopResult {
  readonly stop: GuidedStopTarget | null;
  openStop(nodeId: string, fieldName: string): DocumentCommandResult;
  commitStop(): DocumentCommandResult;
  cancelStop(): DocumentCommandResult;
  /** Drop the stop UI without touching the shared draft (inspector handoff / unmount). */
  releaseStop(): void;
}

export function useDocumentGuidedStop(input: {
  /** Tells WorkflowBuilder which node's selection is stop-driven (suppresses drawer auto-open). */
  onActiveChange: (nodeId: string | null) => void;
}): UseDocumentGuidedStopResult {
  const { onActiveChange } = input;
  const [stop, setStop] = useState<GuidedStopTarget | null>(null);

  // 5.DUAL-BUILDER-1 CS-7 — focus management. The element that was focused when
  // the stop opened (the originating phrase/chip) is captured on open and focus
  // is returned to it after Done / Cancel / Escape closes the editor, so keyboard
  // and screen-reader users land back on the sentence they were editing (never
  // the page root). An inspector handoff (releaseStop) does NOT restore — the
  // drawer takes focus instead.
  const originElementRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (stop !== null) return; // only once the editor has unmounted
    const el = restoreFocusRef.current;
    if (!el) return;
    restoreFocusRef.current = null;
    if (el.isConnected && typeof el.focus === "function") el.focus();
  }, [stop]);

  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const stopNodeExists = useGraphSlice((s) =>
    stop ? s.pendingNodes.some((n) => n.id === stop.nodeId) : true,
  );

  const openStop = useCallback(
    (nodeId: string, fieldName: string): DocumentCommandResult => {
      const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
      if (!node) return { ok: false, reason: "node_missing" };
      // CS-7 — capture the originating phrase/chip so focus can return to it on
      // close. Best-effort: only a connected, focusable element is restored.
      originElementRef.current =
        typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      // Mark the selection stop-driven BEFORE openNode so WorkflowBuilder's
      // drawer transition effect (which fires after this render) sees it.
      onActiveChange(nodeId);
      useConfigSlice.getState().openNode({ nodeId, initialValues: node.config ?? {} });
      const draft = useConfigSlice.getState().drafts[nodeId];
      setStop({
        nodeId,
        fieldName,
        snapshotValues: { ...(draft?.values ?? node.config ?? {}) },
      });
      return { ok: true };
    },
    [onActiveChange],
  );

  const clear = useCallback(
    (opts?: { keepSelection?: boolean }) => {
      // CS-7 — arm focus return to the originating phrase (commit/cancel/Escape).
      restoreFocusRef.current = originElementRef.current;
      originElementRef.current = null;
      setStop(null);
      onActiveChange(null);
      if (!opts?.keepSelection) {
        // Drop the stop-driven selection so a later canvas click on the same
        // node re-triggers the normal inspector transition. Draft preserved.
        useConfigSlice.getState().closeNode();
      }
    },
    [onActiveChange],
  );

  const commitStop = useCallback((): DocumentCommandResult => {
    if (!stop) return { ok: false, reason: "no_draft" };
    const result = commitDocumentField({ nodeId: stop.nodeId });
    clear();
    return result;
  }, [stop, clear]);

  const cancelStop = useCallback((): DocumentCommandResult => {
    if (!stop) return { ok: false, reason: "no_draft" };
    const result = cancelDocumentField({
      nodeId: stop.nodeId,
      snapshotValues: stop.snapshotValues,
    });
    clear();
    return result;
  }, [stop, clear]);

  const releaseStop = useCallback(() => {
    if (!stop) return;
    // Inspector handoff keeps the selection (the drawer is about to own it).
    setStop(null);
    onActiveChange(null);
  }, [stop, onActiveChange]);

  // External close: the node was deleted (undo/redo/another surface — history
  // nav already closed the panel selection) or the selection moved elsewhere.
  useEffect(() => {
    if (!stop) return;
    if (!stopNodeExists || activeNodeId !== stop.nodeId) {
      setStop(null);
      onActiveChange(null);
    }
  }, [stop, stopNodeExists, activeNodeId, onActiveChange]);

  // Unmount (e.g. switching to the Visual surface with the stop open): keep
  // the SHARED draft — uncommitted input stays visible when the inspector
  // next opens this node, by design — but release the stop-driven selection
  // (closeNode preserves drafts) so a later canvas click re-triggers the
  // normal inspector transition instead of appearing dead.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    return () => {
      onActiveChange(null);
      const current = stopRef.current;
      if (current && useConfigSlice.getState().activeNodeId === current.nodeId) {
        useConfigSlice.getState().closeNode();
      }
    };
  }, [onActiveChange]);

  return { stop, openStop, commitStop, cancelStop, releaseStop };
}
