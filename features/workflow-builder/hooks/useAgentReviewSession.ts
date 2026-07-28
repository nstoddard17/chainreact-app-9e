"use client";

import { useEffect, useState } from "react";

/**
 * React Agent review-SESSION identity (REACT-AGENT-REVIEW-RECOVERY-MERGE-1, reduced by
 * BUILDER-ISSUES-RAIL-1).
 *
 * `token` is a monotonic id for the CURRENT review session. Every notice-producing path (apply /
 * stale / failed / restore / template) sets `appliedNodeIds`, so its identity change is exactly
 * "a new review session began". That distinction is what lets a consumer react ONCE per session
 * rather than on every issue-list change as the user fills fields in — today, `WorkflowBuilder`
 * uses it to open the issues rail exactly once per apply.
 *
 * It used to also carry a `focus` — the node/field a session STARTED on, so the floating review
 * tray could open collapsed instead of covering the field the apply had just revealed. The tray is
 * gone and the right drawer is single-slot, so that conflict is now resolved by the rail simply
 * yielding whenever a node is open; nothing read `focus` any more and it was removed rather than
 * left as dead state.
 *
 * Presentation identity only: nothing here decides what is applied, saved, activated, or run.
 */

export interface AgentReviewSession {
  readonly token: number;
}

export function useAgentReviewSession(
  appliedNodeIds: readonly string[],
): AgentReviewSession {
  const [token, setToken] = useState(0);
  useEffect(() => {
    setToken((current) => current + 1);
  }, [appliedNodeIds]);
  return { token };
}
