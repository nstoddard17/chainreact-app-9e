"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import {
  mergeReviewTrayItems,
  summarizeReviewTray,
  type AgentReviewTrayItem,
  type AgentReviewTraySummary,
} from "@/core/workflows/agentReviewTray";

/**
 * Review-tray PRESENTATION state (REACT-AGENT-REVIEW-TRAY-UX-1).
 *
 * The review SESSION itself is owned by `useBuilderPreview` (the apply notice +
 * the agent-touched node ids that produce `AgentSetupIssue[]`). This hook owns only
 * how that session is PRESENTED, deliberately as separate pieces of state:
 *
 *   - `items`          — the ordered session view (resolved items stay in place)
 *   - `expanded`       — tray presentation only
 *   - `selectedIssueId`— which issue the user is currently working on
 *   - scroll offset    — remembered across a collapse/expand round-trip
 *
 * Collapsing changes NOTHING except `expanded`: the item list, the selected issue,
 * the scroll offset, the underlying notice, the selected node, and any unsaved
 * config draft are all untouched. Only a NEW review session (`sessionToken` change
 * — a new apply / restore / template notice) resets presentation state.
 *
 * No store access, no fetch, no navigation: the caller passes `onOpenIssue` through
 * to the EXISTING reveal-node/field path.
 */

export interface UseAgentReviewTrayInput {
  /** The live issue list (recomputed from the draft — an issue disappears once fixed). */
  readonly issues: readonly AgentSetupIssue[];
  /** Bumped when a new review session starts. Only this resets presentation state. */
  readonly sessionToken: number;
  /**
   * REACT-AGENT-REVIEW-RECOVERY-MERGE-1 — the node/field this session opened straight into, when the
   * apply that started it WAS a "take me to this field" action (the rail's `Add to draft & open
   * step` for a preview-only node). The user is already in the config panel on that field, so
   * expanding the tray over it would re-create the exact problem the tray exists to solve: the
   * session opens COLLAPSED with that issue selected, so the compact bar names the field being
   * edited and the field stays usable.
   *
   * Absent / unmatched (a plain Apply, or a target with no corresponding issue) → the tray opens
   * EXPANDED, which is the post-approval behavior.
   */
  readonly sessionFocus?: { readonly nodeId: string; readonly fieldKey?: string } | null;
}

export interface AgentReviewTray {
  readonly items: readonly AgentReviewTrayItem[];
  readonly summary: AgentReviewTraySummary;
  readonly expanded: boolean;
  readonly selectedIssueId: string | null;
  readonly selectedIssue: AgentSetupIssue | null;
  readonly expand: () => void;
  readonly collapse: () => void;
  /** Mark an issue as the one being worked on and collapse so the config panel is usable. */
  readonly selectIssue: (issueId: string) => void;
  readonly rememberScrollTop: (value: number) => void;
  readonly getScrollTop: () => number;
}

/**
 * The issue a session-focus target refers to, matched on the issue's OWN focus target rather than a
 * reconstructed id — so the id format stays private to `buildAgentSetupIssues`.
 */
function findFocusedIssueId(
  issues: readonly AgentSetupIssue[],
  focus: { readonly nodeId: string; readonly fieldKey?: string } | null | undefined,
): string | null {
  if (!focus) return null;
  const match = issues.find(
    (issue) =>
      issue.focusTarget?.nodeId === focus.nodeId &&
      (focus.fieldKey === undefined || issue.focusTarget?.fieldPath === focus.fieldKey),
  );
  return match ? match.id : null;
}

export function useAgentReviewTray({
  issues,
  sessionToken,
  sessionFocus,
}: UseAgentReviewTrayInput): AgentReviewTray {
  const [items, setItems] = useState<readonly AgentReviewTrayItem[]>(() =>
    mergeReviewTrayItems([], issues),
  );
  // Requirement: the tray opens EXPANDED when the review session starts — UNLESS the apply that
  // started it already navigated the user to a field, in which case it opens collapsed on that
  // issue. This must be decided on the FIRST MOUNT too: `BuilderApplyNotice` only renders while a
  // notice exists, so in the real builder a new session usually MOUNTS the tray rather than bumping
  // its token, and an effect-only rule would never fire.
  const initialFocusedId = findFocusedIssueId(issues, sessionFocus);
  const [expanded, setExpanded] = useState(() => initialFocusedId === null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    () => initialFocusedId,
  );
  const scrollTopRef = useRef(0);
  const sessionRef = useRef(sessionToken);

  useEffect(() => {
    const isNewSession = sessionRef.current !== sessionToken;
    sessionRef.current = sessionToken;
    if (isNewSession) {
      setItems(mergeReviewTrayItems([], issues));
      // A session that ALREADY navigated the user to a field starts collapsed on that issue;
      // every other session opens expanded.
      const focusedId = findFocusedIssueId(issues, sessionFocus);
      setExpanded(focusedId === null);
      setSelectedIssueId(focusedId);
      scrollTopRef.current = 0;
      return;
    }
    // Same session: fold the live list in. Resolved items keep their place, so the
    // list never jumps and the remembered scroll offset stays meaningful.
    setItems((prev) => mergeReviewTrayItems(prev, issues));
    // `sessionFocus` is deliberately NOT a dependency: it is read only on the new-session branch,
    // and both it and `sessionToken` are set in the same batch by the apply that starts the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, sessionToken]);

  const summary = useMemo(() => summarizeReviewTray(items), [items]);

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);
  const selectIssue = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
    setExpanded(false);
  }, []);
  const rememberScrollTop = useCallback((value: number) => {
    scrollTopRef.current = value;
  }, []);
  const getScrollTop = useCallback(() => scrollTopRef.current, []);

  const selectedIssue = useMemo(
    () => items.find((item) => item.issue.id === selectedIssueId)?.issue ?? null,
    [items, selectedIssueId],
  );

  return {
    items,
    summary,
    expanded,
    selectedIssueId,
    selectedIssue,
    expand,
    collapse,
    selectIssue,
    rememberScrollTop,
    getScrollTop,
  };
}
