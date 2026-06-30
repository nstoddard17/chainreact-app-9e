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
