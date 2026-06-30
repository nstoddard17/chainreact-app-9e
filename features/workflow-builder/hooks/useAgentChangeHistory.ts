"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentChangeHistoryItem,
  RecordAgentChangeRequest,
} from "@/contracts/agentChangeHistory";
import {
  listAgentChangeHistory,
  recordAgentChange as recordAgentChangeApi,
} from "@/lib/api/agentChangeHistory";

/**
 * AGENT-CHANGE-HISTORY-1 — feature hook that owns the builder's React Agent
 * change-history state.
 *
 * Per workflow-builder-ui.md: hooks orchestrate, calling ONLY typed client API
 * functions (lib/api/*) — never services or repositories. This hook:
 *   - loads the recent change history on mount / workflow change,
 *   - exposes `record`, called from the preview lifecycle seams (preview shown /
 *     applied / discarded / undone / checkpoint restored). `record` is FAIL-OPEN:
 *     the timeline is non-critical telemetry, so a failed POST never throws into
 *     the builder — it resolves to null and leaves the local list untouched.
 *
 * The list updates from the AUTHORITATIVE server item on each successful record
 * (upsert by agentChangeId), so the rail reflects new activity without a reload.
 */

export interface UseAgentChangeHistory {
  readonly items: readonly AgentChangeHistoryItem[];
  readonly loading: boolean;
  readonly error: string | null;
  refresh(): Promise<void>;
  /** Record one agent change; returns the saved item, or null on any failure (fail-open). */
  record(input: RecordAgentChangeRequest): Promise<AgentChangeHistoryItem | null>;
}

/** Upsert the saved item into the list (replace by agentChangeId, else prepend), capped. */
function upsert(
  prev: readonly AgentChangeHistoryItem[],
  saved: AgentChangeHistoryItem,
): AgentChangeHistoryItem[] {
  const without = prev.filter((i) => i.agentChangeId !== saved.agentChangeId);
  return [saved, ...without].slice(0, 20);
}

export function useAgentChangeHistory(
  workflowId: string,
  opts: { enabled?: boolean } = {},
): UseAgentChangeHistory {
  const enabled = opts.enabled !== false;
  const [items, setItems] = useState<readonly AgentChangeHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listAgentChangeHistory(workflowId));
    } catch {
      setError("Couldn't load agent changes.");
    } finally {
      setLoading(false);
    }
  }, [workflowId, enabled]);

  // Load once per workflow (StrictMode-safe double-mount guard, per the
  // React-double-fetch pattern in CLAUDE.md). Re-fetches when the id changes.
  const fetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (fetchedForRef.current === workflowId) return;
    fetchedForRef.current = workflowId;
    void refresh();
  }, [workflowId, enabled, refresh]);

  const record = useCallback(
    async (
      input: RecordAgentChangeRequest,
    ): Promise<AgentChangeHistoryItem | null> => {
      if (!enabled) return null;
      try {
        const saved = await recordAgentChangeApi(workflowId, input);
        setItems((prev) => upsert(prev, saved));
        return saved;
      } catch {
        // Fail-open: the change timeline must never break the builder flow.
        return null;
      }
    },
    [workflowId, enabled],
  );

  return { items, loading, error, refresh, record };
}
