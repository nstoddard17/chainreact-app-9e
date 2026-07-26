"use client";

import { useEffect, useState } from "react";

/**
 * React Agent review-SESSION identity (REACT-AGENT-REVIEW-RECOVERY-MERGE-1).
 *
 * Extracted from `useBuilderPreview` when the two React Agent slices were combined, because the
 * session is now described by TWO pieces of state that must stay together and are consumed by one
 * place (`useAgentReviewTray`, via `BuilderApplyNotice`):
 *
 *   - `token` — a monotonic id for the CURRENT review session. Every notice-producing path (apply /
 *     stale / failed / restore / template) sets `appliedNodeIds`, so its identity change is exactly
 *     "a new review session began". This is the only thing that resets the tray's presentation
 *     state; ordinary issue-list churn as the user fills fields never changes it.
 *   - `focus` — the node/field the session STARTED on, when the apply that began it was itself a
 *     "take me to this field" action (the rail's `Add to draft & open step` for a preview-only
 *     node). Such a session has already put the user in the config panel on that field, so the tray
 *     opens COLLAPSED on it instead of expanding over the field it just revealed. A plain Apply
 *     leaves it null and the tray opens expanded — the post-approval behavior.
 *
 * Presentation identity only: nothing here decides what is applied, saved, activated, or run.
 */

export interface AgentReviewSessionFocus {
  readonly nodeId: string;
  readonly fieldKey?: string;
}

export interface AgentReviewSession {
  readonly token: number;
  readonly focus: AgentReviewSessionFocus | null;
  readonly setFocus: (focus: AgentReviewSessionFocus | null) => void;
}

export function useAgentReviewSession(
  appliedNodeIds: readonly string[],
): AgentReviewSession {
  const [token, setToken] = useState(0);
  const [focus, setFocus] = useState<AgentReviewSessionFocus | null>(null);
  useEffect(() => {
    setToken((current) => current + 1);
  }, [appliedNodeIds]);
  return { token, focus, setFocus };
}
