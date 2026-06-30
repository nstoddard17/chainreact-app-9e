"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { AgentApplyMode } from "@/contracts/agentApplyModes";
import type { AgentChangeCounts } from "./agentChangeSummary";
import { useGraphSlice } from "../state/graphSlice";
import { useRepairVerificationStore } from "../state/repairVerificationStore";
import { useAgentChangeHistory } from "./useAgentChangeHistory";

/** ConfigDiff has no index signature, so cast (not assign) it to the jsonb request shape. */
function diffToJson(diff: ConfigDiff): Record<string, unknown> {
  return diff as unknown as Record<string, unknown>;
}

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
  /** Redacted ConfigDiff for "View diff" (edit path only; the server re-scrubs + caps it). */
  diff?: ConfigDiff;
}

export interface EmitAppliedInput {
  agentChangeId: string;
  checkpointId?: string;
  /** Redacted before→after ConfigDiff captured at apply time (drives "View diff"). */
  diff?: ConfigDiff;
  /** ai_cost_events link, when the apply went through a server path that wrote one. */
  aiCostEventId?: string;
  /**
   * REACT-AGENT-APPLY-MODES-1 — which apply variant produced this applied row
   * (apply_to_draft / apply_and_test). Persisted in the audit metadata so the
   * record distinguishes the two (both share the `preview_applied` status).
   */
  applyMode?: AgentApplyMode;
}

export interface UseAgentChangeEmission {
  readonly items: ReturnType<typeof useAgentChangeHistory>["items"];
  readonly loading: boolean;
  readonly error: string | null;
  refresh(): Promise<void>;
  emitPreviewCreated(input: EmitPreviewCreatedInput): void;
  emitApplied(input: EmitAppliedInput): void;
  emitDiscarded(agentChangeId: string): void;
  /** Records the user choosing to keep the change as a preview (no apply). */
  emitKeptAsPreview(agentChangeId: string): void;
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

  // The repair test-fix flow (RunResultsRepairBlock + useRepairTestVerification) writes timeline rows
  // through the typed client directly (it's outside this hook). It bumps the repair-verification
  // store's `version` on each write; refresh the list so those rows appear without a reload.
  useEffect(() => {
    if (!enabled) return;
    const unsub = useRepairVerificationStore.subscribe((state, prev) => {
      if (state.version !== prev.version) void refresh();
    });
    return unsub;
  }, [enabled, refresh]);

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
        ...(input.diff ? { diff: diffToJson(input.diff) } : {}),
      });
    },
    [enabled, record],
  );

  const emitApplied = useCallback(
    (input: EmitAppliedInput): void => {
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
        ...(input.diff ? { diff: diffToJson(input.diff) } : {}),
        ...(input.aiCostEventId ? { aiCostEventId: input.aiCostEventId } : {}),
        ...(input.applyMode ? { applyMode: input.applyMode } : {}),
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

  const emitKeptAsPreview = useCallback(
    (agentChangeId: string): void => {
      if (!enabled) return;
      // REACT-AGENT-APPLY-MODES-1 — the user explicitly chose keep-as-preview. The
      // change row stays an un-applied preview; record the decision in the audit
      // metadata (applyMode: preview_only) so it's known even without the rail UI.
      void record({ agentChangeId, status: "kept_as_preview", applyMode: "preview_only" });
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
    emitKeptAsPreview,
    emitApplyFailed,
    emitRestored,
  };
}

export { mintAgentChangeId };
