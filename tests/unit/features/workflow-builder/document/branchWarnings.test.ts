/** @jest-environment node */
/**
 * Branch-wiring warnings in the Document projection (5.DUAL-BUILDER-1 / CS-2).
 *
 * CS-1 collapsed any wiring break into a whole-fork complex region. CS-2 keeps
 * a RECOGNIZED fork readable and carries the SHARED
 * `missing_branch_edge` / `stale_branch_edge` findings as lane warnings.
 * Genuinely ambiguous topology still degrades. There is no second branch
 * vocabulary: codes + messages come from `findBranchWiringIssues`, the same
 * source the validation drawer uses.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { findBranchWiringIssues } from "@/core/workflows/branchWiring";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentForkBlock,
} from "@/features/workflow-builder/document/projection";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    kind: "action",
    provider: "slack",
    type: "send_channel_message",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  };
}
const trigger = (id = "t") =>
  node(id, { kind: "trigger", provider: "hubspot", type: "new_contact" });
function edge(from: string, to: string, label?: string): WorkflowEdge {
  return {
    id: `${from}->${to}${label ? `:${label}` : ""}`,
    from,
    to,
    ...(label !== undefined ? { label } : {}),
  };
}
const ifNode = (id: string, over: Partial<WorkflowNode> = {}) =>
  node(id, {
    provider: "native",
    type: "if_then_condition",
    config: { input: "x", operator: "equals", value: "1", onFalse: "branch" },
    ...over,
  });
const routerNode = (id: string, labels: readonly string[]) =>
  node(id, {
    provider: "native",
    type: "router",
    config: {
      routes: labels.map((label) => ({
        label,
        condition: { input: "x", operator: "equals", value: label },
      })),
    },
  });

function firstFork(blocks: readonly DocumentBlock[]): DocumentForkBlock {
  const fork = blocks.find((b) => b.kind === "fork");
  if (!fork || fork.kind !== "fork") throw new Error("expected a fork block");
  return fork;
}

describe("missing_branch_edge", () => {
  const nodes = [trigger(), ifNode("if"), node("a")];
  const edges = [edge("t", "if"), edge("if", "a", "true")];

  it("keeps the fork + lanes visible with a warning on the unwired lane", () => {
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = firstFork(model.blocks);
    expect(fork.lanes).toHaveLength(2);
    const unwired = fork.lanes.find((l) => l.label === "false")!;
    expect(unwired.warning?.code).toBe("missing_branch_edge");
    expect(unwired.blocks).toEqual([]);
    // The wired lane is unaffected.
    expect(fork.lanes.find((l) => l.label === "true")!.warning).toBeNull();
  });

  it("uses the SHARED finding's message verbatim (one vocabulary)", () => {
    const model = projectDefinitionToDocument({ nodes, edges });
    const shared = findBranchWiringIssues(nodes, edges).find(
      (i) => i.code === "missing_branch_edge" && i.branchLabel === "false",
    );
    const lane = firstFork(model.blocks).lanes.find((l) => l.label === "false")!;
    expect(lane.warning?.message).toBe(shared?.message);
  });

  it("warning codes + counts match collectBuilderValidationIssues", () => {
    const model = projectDefinitionToDocument({ nodes, edges });
    const laneWarnings = firstFork(model.blocks)
      .lanes.map((l) => l.warning)
      .filter((w): w is NonNullable<typeof w> => w !== null);
    const builderIssues = collectBuilderValidationIssues({
      pendingNodes: nodes,
      pendingEdges: edges,
    }).filter((i) => i.code === "missing_branch_edge" || i.code === "stale_branch_edge");
    expect(laneWarnings.map((w) => w.code).sort()).toEqual(
      builderIssues.map((i) => i.code).sort(),
    );
  });
});

describe("stale_branch_edge", () => {
  const nodes = [
    trigger(),
    ifNode("if", { config: { input: "x", operator: "equals", value: "1", onFalse: "skip" } }),
    node("a"),
    node("b"),
  ];
  const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false")];

  it("keeps the fork readable and flags the dead lane", () => {
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = firstFork(model.blocks);
    const stale = fork.lanes.find((l) => l.label === "false")!;
    expect(stale.warning?.code).toBe("stale_branch_edge");
    // Its steps still render (they exist), but it never votes on the rejoin.
    expect(stale.blocks[0]).toMatchObject({ kind: "sentence", nodeId: "b" });
    expect(fork.rejoinNodeId).toBeNull();
  });

  it("matches the shared finding message + builder validation codes", () => {
    const model = projectDefinitionToDocument({ nodes, edges });
    const shared = findBranchWiringIssues(nodes, edges).find((i) => i.code === "stale_branch_edge");
    const lane = firstFork(model.blocks).lanes.find((l) => l.label === "false")!;
    expect(lane.warning?.message).toBe(shared?.message);
    const builderCodes = collectBuilderValidationIssues({
      pendingNodes: nodes,
      pendingEdges: edges,
    }).map((i) => i.code);
    expect(builderCodes).toContain("stale_branch_edge");
  });
});

describe("router forks", () => {
  it("an unwired route on a 3-way router warns without collapsing the fork", () => {
    const nodes = [trigger(), routerNode("rt", ["hot", "warm", "cold"]), node("h"), node("w")];
    const edges = [edge("t", "rt"), edge("rt", "h", "hot"), edge("rt", "w", "warm")];
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = firstFork(model.blocks);
    expect(fork.lanes.map((l) => l.label)).toEqual(["hot", "warm", "cold"]);
    expect(fork.lanes[2]!.warning?.code).toBe("missing_branch_edge");
  });
});

describe("still-ambiguous topology keeps degrading", () => {
  it("same-label fan-out is a complex region, not a warning", () => {
    const nodes = [trigger(), ifNode("if"), node("a"), node("b"), node("c")];
    const edges = [
      edge("t", "if"),
      { id: "x1", from: "if", to: "a", label: "true" },
      { id: "x2", from: "if", to: "b", label: "true" },
      edge("if", "c", "false"),
    ];
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("B");
    expect(model.blocks.some((b) => b.kind === "fork")).toBe(false);
    expect(model.blocks.find((b) => b.kind === "complex")).toMatchObject({
      reason: "parallel_fan_out",
    });
  });

  it("multi-point reconvergence is still a complex region", () => {
    const nodes = [
      trigger(),
      routerNode("rt", ["a", "b", "c", "d"]),
      node("na"),
      node("nb"),
      node("nc"),
      node("nd"),
      node("m1"),
      node("m2"),
    ];
    const edges = [
      edge("t", "rt"),
      edge("rt", "na", "a"),
      edge("rt", "nb", "b"),
      edge("rt", "nc", "c"),
      edge("rt", "nd", "d"),
      edge("na", "m1"),
      edge("nb", "m1"),
      edge("nc", "m2"),
      edge("nd", "m2"),
    ];
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("B");
    expect(model.blocks.find((b) => b.kind === "complex")).toMatchObject({
      reason: "ambiguous_rejoin",
    });
  });

  it("a cycle is still a whole-graph Tier C fallback", () => {
    const nodes = [trigger(), ifNode("if"), node("a"), node("b")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
      edge("a", "if"),
    ];
    const model = projectDefinitionToDocument({ nodes, edges });
    expect(model.tier).toBe("C");
    expect(model.blocks[0]).toMatchObject({ kind: "complex", reason: "cycle" });
  });
});
