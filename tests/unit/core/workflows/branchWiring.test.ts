/**
 * @jest-environment node
 *
 * Branch-wiring validation (BRANCH-ENT-1 routing fix D3).
 *
 * Business rule protected: a branching node must have a destination for every
 * route label its handler can return (otherwise the run fails INVALID_BRANCH at
 * runtime), and a labeled connection whose label can never be returned is a
 * silent dead path (renamed/removed route, stale False edge, or a labeled edge
 * out of a non-branching node). Unlabeled cleanup edges are always legitimate.
 */

import {
  findBranchWiringIssues,
  returnableBranchLabels,
} from "@/core/workflows/branchWiring";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

function node(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
  kind: "trigger" | "action" = "action",
  provider = "native",
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function edge(id: string, from: string, to: string, label?: string): WorkflowEdge {
  return { id, from, to, ...(label !== undefined ? { label } : {}) };
}

const trigger = node("t1", "manual", {}, "trigger");
const stepA = node("a1", "delay");
const stepB = node("a2", "delay");

describe("returnableBranchLabels", () => {
  it("If/Then with default onFalse can return true AND false", () => {
    expect(returnableBranchLabels(node("if1", "if_then_condition"))).toEqual([
      "true",
      "false",
    ]);
    expect(
      returnableBranchLabels(node("if1", "if_then_condition", { onFalse: "branch" })),
    ).toEqual(["true", "false"]);
  });

  it("If/Then with onFalse=skip can only return true (false → null branch)", () => {
    expect(
      returnableBranchLabels(node("if1", "if_then_condition", { onFalse: "skip" })),
    ).toEqual(["true"]);
  });

  it("Router vocabulary = route labels + defaultRoute, deduped", () => {
    const router = node("r1", "router", {
      routes: [{ label: "vip" }, { label: "standard" }],
      defaultRoute: "other",
    });
    expect(returnableBranchLabels(router)).toEqual(["vip", "standard", "other"]);
  });

  it("unconfigured or malformed Router has no checkable vocabulary (routes validation owns it)", () => {
    expect(returnableBranchLabels(node("r1", "router"))).toBeNull();
    expect(returnableBranchLabels(node("r1", "router", { routes: [] }))).toBeNull();
    expect(
      returnableBranchLabels(node("r1", "router", { routes: [{ label: "" }] })),
    ).toBeNull();
    expect(
      returnableBranchLabels(node("r1", "router", { routes: "nope" })),
    ).toBeNull();
  });

  it("non-branching nodes have no vocabulary", () => {
    expect(returnableBranchLabels(stepA)).toBeNull();
    expect(returnableBranchLabels(trigger)).toBeNull();
  });
});

describe("findBranchWiringIssues — If/Then Condition", () => {
  const ifBranch = node("if1", "if_then_condition", { onFalse: "branch" });
  const ifSkip = node("if1", "if_then_condition", { onFalse: "skip" });

  it("fully wired true+false branch node has no issues", () => {
    const issues = findBranchWiringIssues(
      [trigger, ifBranch, stepA, stepB],
      [
        edge("e1", "t1", "if1"),
        edge("e2", "if1", "a1", "true"),
        edge("e3", "if1", "a2", "false"),
      ],
    );
    expect(issues).toEqual([]);
  });

  it("missing False edge while onFalse=branch is a missing_branch_edge naming the node and route", () => {
    const issues = findBranchWiringIssues(
      [trigger, ifBranch, stepA],
      [edge("e1", "t1", "if1"), edge("e2", "if1", "a1", "true")],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "missing_branch_edge",
      nodeId: "if1",
      branchLabel: "false",
    });
    expect(issues[0]!.message).toContain('"false"');
  });

  it("true-only graph with onFalse=skip is valid — no hidden False edge required", () => {
    const issues = findBranchWiringIssues(
      [trigger, ifSkip, stepA],
      [edge("e1", "t1", "if1"), edge("e2", "if1", "a1", "true")],
    );
    expect(issues).toEqual([]);
  });

  it("leftover False edge after switching to onFalse=skip is stale_branch_edge", () => {
    const issues = findBranchWiringIssues(
      [trigger, ifSkip, stepA, stepB],
      [
        edge("e1", "t1", "if1"),
        edge("e2", "if1", "a1", "true"),
        edge("e3", "if1", "a2", "false"),
      ],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "stale_branch_edge",
      nodeId: "if1",
      edgeId: "e3",
      branchLabel: "false",
    });
  });

  it("a condition with NO outgoing edges is flagged for every returnable route (a true result would fail the run)", () => {
    const issues = findBranchWiringIssues([trigger, ifBranch], [edge("e1", "t1", "if1")]);
    expect(issues.map((i) => [i.code, i.branchLabel])).toEqual([
      ["missing_branch_edge", "true"],
      ["missing_branch_edge", "false"],
    ]);
  });

  it("unlabeled cleanup edges from a branching node are never flagged", () => {
    const issues = findBranchWiringIssues(
      [trigger, ifSkip, stepA, stepB],
      [
        edge("e1", "t1", "if1"),
        edge("e2", "if1", "a1", "true"),
        edge("e3", "if1", "a2"), // cleanup — always runs
      ],
    );
    expect(issues).toEqual([]);
  });
});

describe("findBranchWiringIssues — Router", () => {
  const router = node("r1", "router", {
    routes: [{ label: "vip" }, { label: "standard" }],
    defaultRoute: "other",
  });
  const stepC = node("a3", "delay");

  it("router with every route + default wired has no issues", () => {
    const issues = findBranchWiringIssues(
      [trigger, router, stepA, stepB, stepC],
      [
        edge("e1", "t1", "r1"),
        edge("e2", "r1", "a1", "vip"),
        edge("e3", "r1", "a2", "standard"),
        edge("e4", "r1", "a3", "other"),
      ],
    );
    expect(issues).toEqual([]);
  });

  it("an unwired route label is missing_branch_edge (first-match selection would fail the run)", () => {
    const issues = findBranchWiringIssues(
      [trigger, router, stepA, stepC],
      [
        edge("e1", "t1", "r1"),
        edge("e2", "r1", "a1", "vip"),
        edge("e4", "r1", "a3", "other"),
      ],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "missing_branch_edge",
      nodeId: "r1",
      branchLabel: "standard",
    });
  });

  it("an unwired defaultRoute is missing_branch_edge too", () => {
    const issues = findBranchWiringIssues(
      [trigger, router, stepA, stepB],
      [
        edge("e1", "t1", "r1"),
        edge("e2", "r1", "a1", "vip"),
        edge("e3", "r1", "a2", "standard"),
      ],
    );
    expect(issues.map((i) => i.branchLabel)).toEqual(["other"]);
  });

  it("an edge labeled with a renamed/removed route is stale_branch_edge", () => {
    const issues = findBranchWiringIssues(
      [trigger, router, stepA, stepB, stepC, node("a4", "delay")],
      [
        edge("e1", "t1", "r1"),
        edge("e2", "r1", "a1", "vip"),
        edge("e3", "r1", "a2", "standard"),
        edge("e4", "r1", "a3", "other"),
        edge("e5", "r1", "a4", "old-route"),
      ],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "stale_branch_edge",
      edgeId: "e5",
      branchLabel: "old-route",
    });
  });

  it("an unconfigured router produces no branch-wiring issues (routes validation owns that state)", () => {
    const bare = node("r1", "router");
    const issues = findBranchWiringIssues(
      [trigger, bare, stepA],
      [edge("e1", "t1", "r1"), edge("e2", "r1", "a1", "vip")],
    );
    expect(issues).toEqual([]);
  });
});

describe("findBranchWiringIssues — non-branching sources", () => {
  it("labeled edges out of ordinary actions/triggers are NOT blocked here (engine substrate stays permissive; AI layer warns)", () => {
    expect(
      findBranchWiringIssues(
        [trigger, stepA, stepB],
        [edge("e1", "t1", "a1"), edge("e2", "a1", "a2", "true")],
      ),
    ).toEqual([]);
    expect(
      findBranchWiringIssues([trigger, stepA], [edge("e1", "t1", "a1", "true")]),
    ).toEqual([]);
  });

  it("dangling labeled edges are ignored here (stale_edge already reports them)", () => {
    const issues = findBranchWiringIssues(
      [trigger, stepA],
      [edge("e1", "t1", "a1"), edge("e2", "gone", "a1", "true")],
    );
    expect(issues).toEqual([]);
  });

  it("unlabeled linear graphs produce no issues", () => {
    const issues = findBranchWiringIssues(
      [trigger, stepA, stepB],
      [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
    );
    expect(issues).toEqual([]);
  });
});
