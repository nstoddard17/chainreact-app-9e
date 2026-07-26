import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import {
  describeReviewTrayRemaining,
  describeReviewTrayStatusLine,
  mergeReviewTrayItems,
  summarizeReviewTray,
  type AgentReviewTrayItem,
} from "@/core/workflows/agentReviewTray";

/**
 * REACT-AGENT-REVIEW-TRAY-UX-1 — the pure review-session read-model behind the
 * collapsible tray. It keeps a stable, ordered view of every issue seen during the
 * session so the list never jumps under the user as they fix fields.
 */

function issue(over: Partial<AgentSetupIssue> = {}): AgentSetupIssue {
  return {
    id: "missing_required_field:n1:to",
    kind: "missing_required_field",
    workflowId: "wf1",
    nodeId: "n1",
    nodeLabel: "Gmail",
    actionLabel: "Gmail",
    fieldPath: "to",
    fieldLabel: "To",
    message: "Gmail needs a To.",
    explanation: "React added this step but didn't have enough information to fill this in safely.",
    nextStep: "Open the To field and fill it in.",
    blocking: true,
    focusTarget: { nodeId: "n1", fieldPath: "to" },
    ...over,
  };
}

const to = issue();
const subject = issue({ id: "missing_required_field:n1:subject", fieldPath: "subject", fieldLabel: "Subject", message: "Gmail needs a Subject." });
const softRef = issue({
  id: "unresolved_variable:n2:body",
  kind: "unresolved_variable",
  nodeId: "n2",
  blocking: false,
  message: "Slack uses data from a step that no longer exists.",
});

describe("mergeReviewTrayItems", () => {
  it("seeds the session from the live list, all unresolved, in order", () => {
    const items = mergeReviewTrayItems([], [to, subject]);
    expect(items.map((i) => [i.issue.id, i.resolved])).toEqual([
      [to.id, false],
      [subject.id, false],
    ]);
  });

  it("marks an issue the live list no longer reports as resolved, IN PLACE", () => {
    const first = mergeReviewTrayItems([], [to, subject, softRef]);
    // The user fills in the middle field → the live rule stops reporting it.
    const next = mergeReviewTrayItems(first, [to, softRef]);
    expect(next.map((i) => [i.issue.id, i.resolved])).toEqual([
      [to.id, false],
      [subject.id, true], // still second — the list does not re-order or shrink
      [softRef.id, false],
    ]);
  });

  it("appends a newly-reported issue at the end without disturbing existing rows", () => {
    const first = mergeReviewTrayItems([], [to]);
    const next = mergeReviewTrayItems(first, [to, subject]);
    expect(next.map((i) => i.issue.id)).toEqual([to.id, subject.id]);
    expect(next.every((i) => !i.resolved)).toBe(true);
  });

  it("un-resolves an issue that comes back (the user cleared the field again), keeping its position", () => {
    const first = mergeReviewTrayItems([], [to, subject]);
    const resolved = mergeReviewTrayItems(first, [subject]);
    expect(resolved[0]!.resolved).toBe(true);
    const back = mergeReviewTrayItems(resolved, [to, subject]);
    expect(back.map((i) => [i.issue.id, i.resolved])).toEqual([
      [to.id, false],
      [subject.id, false],
    ]);
  });

  it("carries the FRESH issue object forward so live copy changes are picked up", () => {
    const first = mergeReviewTrayItems([], [to]);
    const renamed = issue({ message: "Send Email needs a To." });
    const next = mergeReviewTrayItems(first, [renamed]);
    expect(next[0]!.issue).toBe(renamed);
  });

  it("returns the SAME array when nothing changed (no needless re-render / scroll churn)", () => {
    const first = mergeReviewTrayItems([], [to, subject]);
    expect(mergeReviewTrayItems(first, [to, subject])).toBe(first);
  });
});

describe("summarizeReviewTray", () => {
  function items(...list: AgentSetupIssue[]): readonly AgentReviewTrayItem[] {
    return mergeReviewTrayItems([], list);
  }

  it("counts remaining, resolved, and blocking-remaining separately", () => {
    const all = mergeReviewTrayItems(items(to, subject, softRef), [subject, softRef]);
    const summary = summarizeReviewTray(all);
    expect(summary).toMatchObject({ total: 3, remaining: 2, resolved: 1, blockingRemaining: 1 });
  });

  it("is BLOCKED while any remaining issue blocks activation", () => {
    expect(summarizeReviewTray(items(to, softRef)).status).toBe("blocked");
  });

  it("is REVIEW when only non-blocking issues remain", () => {
    expect(summarizeReviewTray(items(softRef)).status).toBe("review");
  });

  it("is READY once every issue is resolved", () => {
    const all = mergeReviewTrayItems(items(to, subject), []);
    const summary = summarizeReviewTray(all);
    expect(summary).toMatchObject({ total: 2, remaining: 0, resolved: 2, status: "ready" });
  });
});

describe("review tray copy", () => {
  it("says how many issues remain, singular and plural", () => {
    const two = summarizeReviewTray(mergeReviewTrayItems([], [to, subject]));
    expect(describeReviewTrayRemaining(two)).toBe("2 issues remaining");
    const one = summarizeReviewTray(mergeReviewTrayItems([], [to]));
    expect(describeReviewTrayRemaining(one)).toBe("1 issue remaining");
  });

  it("reports completion instead of a count once nothing remains", () => {
    const done = summarizeReviewTray(mergeReviewTrayItems(mergeReviewTrayItems([], [to]), []));
    expect(describeReviewTrayRemaining(done)).toBe("All setup complete");
    expect(describeReviewTrayStatusLine(done)).toBe("Ready · All setup complete");
  });

  it("builds the compact status line the collapsed tray + live region announce", () => {
    const blocked = summarizeReviewTray(mergeReviewTrayItems([], [to, subject]));
    expect(describeReviewTrayStatusLine(blocked)).toBe("Blocked · 2 issues remaining");
  });
});
