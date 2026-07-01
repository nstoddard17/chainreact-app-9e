/**
 * Contracts for the internal React Agent feedback dashboard (INTERNAL-FEEDBACK-1).
 *
 * This first slice ships the access foundation and an EMPTY dashboard shell — no
 * metrics. The overview DTO therefore reports only a connection status and the
 * planned section list, never numbers. Future metric slices extend
 * `ReactAgentOverview` with real, privacy-reviewed aggregates; the `status`
 * flips to `"connected"` when they land.
 */

/** Stable ids for the dashboard's planned metric sections. */
export type ReactAgentSectionId =
  | "overview"
  | "preview-funnel"
  | "setup-issues"
  | "test-outcomes"
  | "recent-attempts";

export interface ReactAgentSectionMeta {
  readonly id: ReactAgentSectionId;
  readonly title: string;
}

/**
 * Read-only overview returned by `/api/internal/react-agent/overview`. In this
 * slice it is intentionally metric-free: `status: "not_connected"` tells the UI
 * to render empty states rather than any number.
 */
export interface ReactAgentOverview {
  readonly status: "not_connected";
  readonly sections: readonly ReactAgentSectionMeta[];
}

/** The planned dashboard sections, in display order. Single source for both the
 *  API stub and the UI shell so they cannot drift. */
export const REACT_AGENT_SECTIONS: readonly ReactAgentSectionMeta[] = [
  { id: "overview", title: "Overview" },
  { id: "preview-funnel", title: "Preview funnel" },
  { id: "setup-issues", title: "Setup issues" },
  { id: "test-outcomes", title: "Test outcomes" },
  { id: "recent-attempts", title: "Recent agent attempts" },
];

/**
 * Phase 2 — internal React Agent metrics (INTERNAL-FEEDBACK-2).
 *
 * AGGREGATE COUNTS ONLY. This DTO deliberately carries no prompt/summary/
 * failure_reason/diff/metadata, and no account_id/user_id/workflow_id — the
 * repository never even SELECTs those columns. Every field is a non-negative
 * integer. Empty data yields zeros, never placeholders. `from`/`to` echo the
 * normalized (ISO) date range that was applied to `created_at`, or null.
 */
export interface ReactAgentMetricsRange {
  readonly from: string | null;
  readonly to: string | null;
}

export interface ReactAgentPreviewFunnel {
  readonly created: number;
  readonly applied: number;
  readonly keptAsPreview: number;
  readonly discarded: number;
  readonly applyFailed: number;
  readonly undone: number;
}

export interface ReactAgentTestOutcomes {
  readonly tested: number;
  readonly testFailed: number;
}

export interface ReactAgentSetupIssues {
  readonly changesWithIssues: number;
  readonly totalIssues: number;
  readonly workflowsNeedingSetup: number;
}

export interface ReactAgentGovernanceOutcomes {
  readonly success: number;
  readonly denied: number;
  readonly failed: number;
}

export interface ReactAgentMetrics {
  readonly range: ReactAgentMetricsRange;
  readonly totals: {
    readonly agentChanges: number;
    readonly governanceEvents: number;
  };
  readonly previewFunnel: ReactAgentPreviewFunnel;
  readonly testOutcomes: ReactAgentTestOutcomes;
  readonly setupIssues: ReactAgentSetupIssues;
  readonly governance: { readonly byOutcome: ReactAgentGovernanceOutcomes };
}

/** Zero-valued metrics — the honest shape for empty tables / a fresh install. */
export const EMPTY_REACT_AGENT_METRICS: ReactAgentMetrics = {
  range: { from: null, to: null },
  totals: { agentChanges: 0, governanceEvents: 0 },
  previewFunnel: { created: 0, applied: 0, keptAsPreview: 0, discarded: 0, applyFailed: 0, undone: 0 },
  testOutcomes: { tested: 0, testFailed: 0 },
  setupIssues: { changesWithIssues: 0, totalIssues: 0, workflowsNeedingSetup: 0 },
  governance: { byOutcome: { success: 0, denied: 0, failed: 0 } },
};
