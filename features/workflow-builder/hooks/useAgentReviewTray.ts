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

export function useAgentReviewTray({
  issues,
  sessionToken,
}: UseAgentReviewTrayInput): AgentReviewTray {
  const [items, setItems] = useState<readonly AgentReviewTrayItem[]>(() =>
    mergeReviewTrayItems([], issues),
  );
  // Requirement: the tray opens EXPANDED when the review session starts.
  const [expanded, setExpanded] = useState(true);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const scrollTopRef = useRef(0);
  const sessionRef = useRef(sessionToken);

  useEffect(() => {
    const isNewSession = sessionRef.current !== sessionToken;
    sessionRef.current = sessionToken;
    if (isNewSession) {
      setItems(mergeReviewTrayItems([], issues));
      setExpanded(true);
      setSelectedIssueId(null);
      scrollTopRef.current = 0;
      return;
    }
    // Same session: fold the live list in. Resolved items keep their place, so the
    // list never jumps and the remembered scroll offset stays meaningful.
    setItems((prev) => mergeReviewTrayItems(prev, issues));
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
