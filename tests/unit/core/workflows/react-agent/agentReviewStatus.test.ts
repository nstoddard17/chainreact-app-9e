/**
 * Setup-review status vocabulary (BUILDER-ISSUES-RAIL-1).
 *
 * The tray's merge/summary read-model was deleted with the tray itself — the issues rail is always
 * live, so a fixed issue leaving the list is correct there and needs no "keep it visible as
 * Resolved" machinery. What survives is the shared status wording, which exists precisely so two
 * surfaces can never describe the same state differently.
 */

import {
  describeRemainingIssues,
  REVIEW_STATUS_LABEL,
  type AgentReviewStatus,
} from "@/core/workflows/agentReviewStatus";

describe("REVIEW_STATUS_LABEL", () => {
  it("labels every status", () => {
    expect(REVIEW_STATUS_LABEL.blocked).toBe("Blocked");
    expect(REVIEW_STATUS_LABEL.review).toBe("Needs review");
    expect(REVIEW_STATUS_LABEL.ready).toBe("Ready");
  });

  it("is total over the status union", () => {
    const all: AgentReviewStatus[] = ["blocked", "review", "ready"];
    for (const status of all) {
      expect(typeof REVIEW_STATUS_LABEL[status]).toBe("string");
      expect(REVIEW_STATUS_LABEL[status].length).toBeGreaterThan(0);
    }
  });
});

describe("describeRemainingIssues", () => {
  it("reports completion rather than a zero count", () => {
    expect(describeRemainingIssues(0)).toBe("All setup complete");
  });

  it("singularizes one issue", () => {
    expect(describeRemainingIssues(1)).toBe("1 issue remaining");
  });

  it("pluralizes more than one", () => {
    expect(describeRemainingIssues(2)).toBe("2 issues remaining");
    expect(describeRemainingIssues(16)).toBe("16 issues remaining");
  });
});
