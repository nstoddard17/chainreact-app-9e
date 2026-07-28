/**
 * Setup-review status vocabulary (REACT-AGENT-REVIEW-TRAY-UX-1, reduced by BUILDER-ISSUES-RAIL-1).
 *
 * One word for "can this workflow run yet?", shared by every surface that answers the question so
 * two of them can never label the same state differently.
 *
 * This module used to also hold the floating review tray's session read-model — an ordered item
 * list that kept a fixed issue visible as "Resolved" instead of letting it vanish. That existed
 * because the tray was a transient panel a user reviewed once. The issues rail is always available
 * and always live, so an issue disappearing the moment it is fixed is the correct behavior there
 * (and is what that rail already did); the merge/summary machinery was deleted with the tray
 * rather than left as dead code.
 *
 * Pure: no React, no store, no I/O.
 */

export type AgentReviewStatus = "blocked" | "review" | "ready";

/**
 * Human-readable status word. `blocked` means at least one gap prevents a test run / activation;
 * `review` means only non-blocking items remain; `ready` means nothing is outstanding.
 */
export const REVIEW_STATUS_LABEL: Record<AgentReviewStatus, string> = {
  blocked: "Blocked",
  review: "Needs review",
  ready: "Ready",
};

/** The remaining-count phrase, shared so the status header and tests can never drift. */
export function describeRemainingIssues(remaining: number): string {
  if (remaining === 0) return "All setup complete";
  return remaining === 1 ? "1 issue remaining" : `${remaining} issues remaining`;
}
