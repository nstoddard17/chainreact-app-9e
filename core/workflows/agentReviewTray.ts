import type { AgentSetupIssue } from "./agentSetupIssues";

/**
 * React Agent review-tray read-model (REACT-AGENT-REVIEW-TRAY-UX-1).
 *
 * The post-apply "Setup needed" list (`buildAgentSetupIssues`) is recomputed from
 * the LIVE draft, so an issue simply VANISHES the moment the user fills the field.
 * That is correct for readiness but wrong for a review loop: the list would jump,
 * the scroll position would shift under the user, and there would be no signal that
 * the thing they just fixed is now done.
 *
 * This pure helper keeps a stable, ordered REVIEW SESSION view on top of that live
 * list: every issue seen during the session stays in place, and one that is no
 * longer reported is marked `resolved` instead of disappearing. A gap that comes
 * back (the user cleared the field again) flips back to unresolved in its original
 * position.
 *
 * Pure: no React, no store, no I/O — it only re-shapes the already-redacted
 * `AgentSetupIssue` read-model (labels / names / enums, never config values).
 */

export interface AgentReviewTrayItem {
  /** The issue as last reported. For a resolved item this is the final snapshot. */
  readonly issue: AgentSetupIssue;
  /** True once the live issue list no longer reports this issue. */
  readonly resolved: boolean;
}

export type AgentReviewTrayStatus = "blocked" | "review" | "ready";

export interface AgentReviewTraySummary {
  /** Every issue seen during this review session (resolved + unresolved). */
  readonly total: number;
  readonly remaining: number;
  readonly resolved: number;
  /** Unresolved issues that block a test run / activation. */
  readonly blockingRemaining: number;
  readonly status: AgentReviewTrayStatus;
}

/** Human-readable status word for the tray pill (expanded header + collapsed bar). */
export const REVIEW_TRAY_STATUS_LABEL: Record<AgentReviewTrayStatus, string> = {
  blocked: "Blocked",
  review: "Needs review",
  ready: "Ready",
};

/**
 * Merge the LIVE issue list into the session's ordered item list.
 *
 * - an item still reported → carried forward with the fresh issue, unresolved
 * - an item no longer reported → kept IN PLACE and marked resolved
 * - a newly reported issue → appended in live order
 *
 * Returns `previous` unchanged when nothing moved, so callers can rely on
 * referential stability (no needless re-render / scroll churn).
 */
export function mergeReviewTrayItems(
  previous: readonly AgentReviewTrayItem[],
  current: readonly AgentSetupIssue[],
): readonly AgentReviewTrayItem[] {
  const liveById = new Map(current.map((issue) => [issue.id, issue]));
  const seen = new Set<string>();
  const merged: AgentReviewTrayItem[] = [];

  for (const item of previous) {
    const id = item.issue.id;
    if (seen.has(id)) continue; // defensive: never duplicate an id
    seen.add(id);
    const live = liveById.get(id);
    merged.push(live ? { issue: live, resolved: false } : { issue: item.issue, resolved: true });
  }
  for (const issue of current) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    merged.push({ issue, resolved: false });
  }

  const unchanged =
    merged.length === previous.length &&
    merged.every((item, i) => {
      const prev = previous[i];
      return !!prev && prev.issue === item.issue && prev.resolved === item.resolved;
    });
  return unchanged ? previous : merged;
}

/** Counts + the single status word the tray renders in both expanded and collapsed form. */
export function summarizeReviewTray(
  items: readonly AgentReviewTrayItem[],
): AgentReviewTraySummary {
  let remaining = 0;
  let blockingRemaining = 0;
  for (const item of items) {
    if (item.resolved) continue;
    remaining += 1;
    if (item.issue.blocking) blockingRemaining += 1;
  }
  const total = items.length;
  const status: AgentReviewTrayStatus =
    remaining === 0 ? "ready" : blockingRemaining > 0 ? "blocked" : "review";
  return { total, remaining, resolved: total - remaining, blockingRemaining, status };
}

/** The remaining-count phrase — the live-region text the user hears on each change. */
export function describeReviewTrayRemaining(summary: AgentReviewTraySummary): string {
  if (summary.total === 0) return "No setup items";
  if (summary.remaining === 0) return "All setup complete";
  return summary.remaining === 1 ? "1 issue remaining" : `${summary.remaining} issues remaining`;
}

/** The one-line "Blocked · 16 issues remaining" status line used by the tray + live region. */
export function describeReviewTrayStatusLine(summary: AgentReviewTraySummary): string {
  return `${REVIEW_TRAY_STATUS_LABEL[summary.status]} · ${describeReviewTrayRemaining(summary)}`;
}
