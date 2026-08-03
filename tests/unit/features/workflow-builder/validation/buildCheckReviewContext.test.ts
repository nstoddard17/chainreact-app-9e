/** @jest-environment node */
/**
 * buildCheckReviewContext — the builder's deterministic snapshot for the "Check workflow" review
 * (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW).
 *
 * Proves it reuses the shared builder validator (so the count == the header pill), surfaces author-
 * facing issue messages + de-identified codes, and produces a plain-English workflow summary.
 */
import { buildCheckReviewContext } from "@/features/workflow-builder/validation/buildCheckReviewContext";
import type { WorkflowNode, WorkflowEdge } from "@/contracts/workflow";

function node(p: Partial<WorkflowNode> & Pick<WorkflowNode, "id" | "kind" | "provider" | "type">): WorkflowNode {
  return { config: {}, position: { x: 0, y: 0 }, ...p };
}

const REQUIRED = {
  "slack:send_message": {
    displayName: "Slack message",
    requiredFields: [{ name: "channel", label: "Channel" }],
  },
} as const;

describe("buildCheckReviewContext", () => {
  it("reports a blocking issue (count + author message + code) and a plain-English summary", () => {
    const nodes: WorkflowNode[] = [
      node({ id: "t", kind: "trigger", provider: "gmail", type: "new_email" }),
      node({ id: "a", kind: "action", provider: "slack", type: "send_message" }), // channel empty
    ];
    const edges: WorkflowEdge[] = [{ id: "e", from: "t", to: "a" }];

    const ctx = buildCheckReviewContext({
      pendingNodes: nodes,
      pendingEdges: edges,
      requiredFieldsByType: REQUIRED,
      providerLabels: { gmail: "Gmail", slack: "Slack" },
    });

    expect(ctx.blockingIssueCount).toBe(1);
    expect(ctx.issueCodes).toContain("missing_required_field");
    expect(ctx.issueMessages.join(" ")).toMatch(/Channel/);
    // Friendly summary uses provider labels + humanized types.
    expect(ctx.summary).toContain("Gmail new email");
    expect(ctx.summary).toContain("Slack send message");
    // BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP — the missing-field node becomes a setup target (KEY names
    // only, node identity from the live draft; no values).
    expect(ctx.setupTargets).toHaveLength(1);
    expect(ctx.setupTargets[0]).toMatchObject({
      nodeId: "a",
      provider: "slack",
      type: "send_message",
      missingFieldNames: ["channel"],
    });
    expect(ctx.setupTargets[0]!.label).toContain("Slack");
  });

  it("a fully-configured, connected workflow has zero blockers", () => {
    const nodes: WorkflowNode[] = [
      node({ id: "t", kind: "trigger", provider: "gmail", type: "new_email" }),
      node({ id: "a", kind: "action", provider: "slack", type: "send_message", config: { channel: "C1" } }),
    ];
    const edges: WorkflowEdge[] = [{ id: "e", from: "t", to: "a" }];

    const ctx = buildCheckReviewContext({
      pendingNodes: nodes,
      pendingEdges: edges,
      requiredFieldsByType: REQUIRED,
    });

    expect(ctx.blockingIssueCount).toBe(0);
    expect(ctx.issueMessages).toHaveLength(0);
  });

  it("describes an empty workflow without crashing", () => {
    const ctx = buildCheckReviewContext({ pendingNodes: [], pendingEdges: [] });
    expect(ctx.summary).toMatch(/empty/i);
    // No trigger present → the shared validator flags it as a blocker.
    expect(ctx.blockingIssueCount).toBeGreaterThan(0);
    expect(ctx.issueCodes).toContain("no_trigger");
  });
});
