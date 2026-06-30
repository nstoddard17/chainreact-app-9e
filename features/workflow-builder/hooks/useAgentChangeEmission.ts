"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AgentChangeCounts } from "./agentChangeSummary";
import { useGraphSlice } from "../state/graphSlice";
import { useAgentChangeHistory } from "./useAgentChangeHistory";

/**
 * AGENT-CHANGE-HISTORY-1 — emission orchestration for the React Agent change
 * timeline. Wraps {@link useAgentChangeHistory} (the typed-client data hook) and
 * exposes high-level `emit*` calls the builder fires at the preview lifecycle
 * seams (shown / applied / discarded / failed / restored), plus client-side
 * UNDO detection so undoing an agent apply records an `undone` event.
 *
 * Undo detection (no blast radius to the undo call sites): after an apply we
 * remember the graph history depth (`past.length`). The graph slice pushes the
 * pre-edit snapshot to `past` on every edit and moves the current snapshot to
 * `future` on undo. So the apply is "the next undo" exactly while
 * `past.length === appliedPastLength`; an undo that lands there (future grows,
 * past drops by one) IS that apply being reverted → record `undone`. A later
 * edit (past grows beyond the mark) means the apply is no longer the next undo →
 * forget it (a heuristic: we only attribute the FIRST undo right after an apply).
 *
 * All emits are FAIL-OPEN via the data hook — the timeline never breaks the
 * builder. Disabled (logged-out local-only builder) → every emit is a no-op.
 */

/** UUID v4 — prefers crypto.randomUUID (mirrors graphSlice), UUID-shaped fallback. */
function mintAgentChangeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback keeps the contract's `.uuid()` happy in environments without crypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface UndoableApply {
  readonly agentChangeId: string;
  readonly appliedPastLength: number;
}

export interface EmitPreviewCreatedInput {
  agentChangeId: string;
  prompt?: string;
  title?: string | null;
  summary?: string;
  counts: AgentChangeCounts;
  previewPatchRef?: string;
}

export interface UseAgentChangeEmission {
  readonly items: ReturnType<typeof useAgentChangeHistory>["items"];
  readonly loading: boolean;
  readonly error: string | null;
  refresh(): Promise<void>;
  emitPreviewCreated(input: EmitPreviewCreatedInput): void;
  emitApplied(input: { agentChangeId: string; checkpointId?: string }): void;
  emitDiscarded(agentChangeId: string): void;
  emitApplyFailed(input: { agentChangeId: string; reason: string }): void;
  /** Records a `restored_checkpoint` row (mints its own change id). */
  emitRestored(checkpointId: string): void;
}

export function useAgentChangeEmission(
  workflowId: string,
  opts: { enabled?: boolean } = {},
): UseAgentChangeEmission {
  const enabled = opts.enabled !== false;
  const { items, loading, error, refresh, record } = useAgentChangeHistory(
    workflowId,
    { enabled },
  );

  // The agent apply that is currently "the next undo" (undoable), or null.
  const undoableRef = useRef<UndoableApply | null>(null);

  useEffect(() => {
    // Reset on workflow change / disable (record is rebuilt when workflowId changes).
    undoableRef.current = null;
    if (!enabled) return;
    const unsub = useGraphSlice.subscribe((state, prev) => {
      const mark = undoableRef.current;
      if (!mark) return;
      const past = state.past.length;
      const future = state.future.length;
      if (future > prev.future.length && past === mark.appliedPastLength - 1) {
        // The apply was just undone.
        undoableRef.current = null;
        void record({ agentChangeId: mark.agentChangeId, status: "undone" });
      } else if (past > mark.appliedPastLength) {
        // A later edit landed on top — the apply is no longer the next undo.
        undoableRef.current = null;
      }
    });
    return unsub;
  }, [enabled, record]);

  const emitPreviewCreated = useCallback(
    (input: EmitPreviewCreatedInput): void => {
      if (!enabled) return;
      void record({
        agentChangeId: input.agentChangeId,
        status: "preview_created",
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        addedNodeCount: input.counts.addedNodeCount,
        removedNodeCount: input.counts.removedNodeCount,
        changedNodeCount: input.counts.changedNodeCount,
        changedConfigCount: input.counts.changedConfigCount,
        setupIssueCount: input.counts.setupIssueCount,
        ...(input.previewPatchRef ? { previewPatchRef: input.previewPatchRef } : {}),
      });
    },
    [enabled, record],
  );

  const emitApplied = useCallback(
    (input: { agentChangeId: string; checkpointId?: string }): void => {
      if (!enabled) return;
      // Mark this apply as the next-undoable, capturing the post-apply history depth.
      undoableRef.current = {
        agentChangeId: input.agentChangeId,
        appliedPastLength: useGraphSlice.getState().past.length,
      };
      void record({
        agentChangeId: input.agentChangeId,
        status: "preview_applied",
        ...(input.checkpointId ? { checkpointId: input.checkpointId } : {}),
      });
    },
    [enabled, record],
  );

  const emitDiscarded = useCallback(
    (agentChangeId: string): void => {
      if (!enabled) return;
      void record({ agentChangeId, status: "preview_discarded" });
    },
    [enabled, record],
  );

  const emitApplyFailed = useCallback(
    (input: { agentChangeId: string; reason: string }): void => {
      if (!enabled) return;
      void record({
        agentChangeId: input.agentChangeId,
        status: "apply_failed",
        failureReason: input.reason,
      });
    },
    [enabled, record],
  );

  const emitRestored = useCallback(
    (checkpointId: string): void => {
      if (!enabled) return;
      void record({
        agentChangeId: mintAgentChangeId(),
        status: "restored_checkpoint",
        checkpointId,
      });
    },
    [enabled, record],
  );

  return {
    items,
    loading,
    error,
    refresh,
    emitPreviewCreated,
    emitApplied,
    emitDiscarded,
    emitApplyFailed,
    emitRestored,
  };
}

export { mintAgentChangeId };
