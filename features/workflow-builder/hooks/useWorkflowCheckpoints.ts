"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowCheckpoint } from "@/contracts/workflowCheckpoint";
import type { WorkflowDefinition, WorkflowDetail } from "@/contracts/workflow";
import { WorkflowApiError } from "@/lib/api/workflows";
import {
  createWorkflowCheckpoint,
  listWorkflowCheckpoints,
  restoreWorkflowCheckpoint,
} from "@/lib/api/workflowCheckpoints";

/**
 * CHECKPOINTS-1 — feature hook that owns the builder's recent-checkpoints state.
 *
 * Per workflow-builder-ui.md: hooks orchestrate, calling ONLY typed client API
 * functions (lib/api/*) — never services or repositories. This hook:
 *   - loads the recent checkpoints on mount / workflow change,
 *   - exposes `createReactAgentCheckpoint` (called by the apply flow BEFORE it
 *     mutates the local draft, capturing the pre-change snapshot),
 *   - exposes `restore`, which returns the updated WorkflowDetail so the caller
 *     can re-hydrate the builder graph (the hook does not touch the graph slice).
 */

function messageFor(err: unknown, fallback: string): string {
  return err instanceof WorkflowApiError ? err.message : fallback;
}

export interface UseWorkflowCheckpoints {
  readonly checkpoints: readonly WorkflowCheckpoint[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly restoringId: string | null;
  readonly restoreError: string | null;
  refresh(): Promise<void>;
  /** Persist a "Before React Agent change" checkpoint of the supplied pre-change draft. */
  createReactAgentCheckpoint(input: {
    definition: WorkflowDefinition;
    prompt?: string;
    summary?: string;
  }): Promise<WorkflowCheckpoint>;
  /** Restore a checkpoint server-side; resolves to the updated detail for re-hydration. */
  restore(checkpointId: string): Promise<WorkflowDetail>;
}

export function useWorkflowCheckpoints(
  workflowId: string,
  opts: { enabled?: boolean } = {},
): UseWorkflowCheckpoints {
  const enabled = opts.enabled !== false;
  const [checkpoints, setCheckpoints] = useState<readonly WorkflowCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      setCheckpoints(await listWorkflowCheckpoints(workflowId));
    } catch (err) {
      setError(messageFor(err, "Couldn't load checkpoints."));
    } finally {
      setLoading(false);
    }
  }, [workflowId, enabled]);

  // Load once per workflow (StrictMode-safe double-mount guard, per the
  // React-double-fetch pattern in CLAUDE.md). Re-fetches when the workflow id
  // changes.
  const fetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (fetchedForRef.current === workflowId) return;
    fetchedForRef.current = workflowId;
    void refresh();
  }, [workflowId, enabled, refresh]);

  const createReactAgentCheckpoint = useCallback(
    async (input: {
      definition: WorkflowDefinition;
      prompt?: string;
      summary?: string;
    }): Promise<WorkflowCheckpoint> => {
      const created = await createWorkflowCheckpoint(workflowId, {
        definition: input.definition,
        source: "react_agent",
        name: "Before React Agent change",
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
      });
      // Optimistically surface it at the top so the rail updates immediately.
      setCheckpoints((prev) => [created, ...prev].slice(0, 20));
      return created;
    },
    [workflowId],
  );

  const restore = useCallback(
    async (checkpointId: string): Promise<WorkflowDetail> => {
      setRestoringId(checkpointId);
      setRestoreError(null);
      try {
        return await restoreWorkflowCheckpoint(workflowId, checkpointId);
      } catch (err) {
        setRestoreError(messageFor(err, "Couldn't restore this checkpoint."));
        throw err;
      } finally {
        setRestoringId(null);
      }
    },
    [workflowId],
  );

  return {
    checkpoints,
    loading,
    error,
    restoringId,
    restoreError,
    refresh,
    createReactAgentCheckpoint,
    restore,
  };
}
