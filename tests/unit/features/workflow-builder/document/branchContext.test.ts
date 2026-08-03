/** @jest-environment node */
/**
 * Document lane-context projection (5.DUAL-BUILDER-1 / CS-5).
 *
 * Pure derivations over the DocumentModel: breadcrumb ancestry, sibling-lane
 * chips, fork lookup, and depth. Lane identity comes ONLY from the projection's
 * `edge.label`-derived lanes — never canvas position or handles.
 */
import type { WorkflowDefinition } from "@/contracts/workflow";
import {
  buildLaneContext,
  findForkBlock,
  firstNodeIdOfBlocks,
} from "@/features/workflow-builder/document/documentBranchContext";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";

/** trigger → If(outer) → true: If(inner) → true: leaf(enterprise) / false: leaf(smb) ; false: leaf(cold) */
function nestedDefinition(): WorkflowDefinition {
  return {
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      { id: "outer", kind: "action", provider: "native", type: "if_then_condition", config: { input: "{{t.hot}}", operator: "is_truthy", onFalse: "branch" }, position: { x: 0, y: 120 } },
      { id: "inner", kind: "action", provider: "native", type: "if_then_condition", config: { input: "{{t.ent}}", operator: "is_truthy", onFalse: "branch" }, position: { x: -100, y: 240 } },
      { id: "ent", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "enterprise" }, position: { x: -160, y: 360 } },
      { id: "smb", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "smb" }, position: { x: -40, y: 360 } },
      { id: "cold", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "cold" }, position: { x: 160, y: 240 } },
    ],
    edges: [
      { id: "e1", from: "t", to: "outer" },
      { id: "e2", from: "outer", to: "inner", label: "true" },
      { id: "e3", from: "outer", to: "cold", label: "false" },
      { id: "e4", from: "inner", to: "ent", label: "true" },
      { id: "e5", from: "inner", to: "smb", label: "false" },
    ],
  };
}

function model(def: WorkflowDefinition) {
  return projectDefinitionToDocument({ nodes: def.nodes, edges: def.edges });
}

describe("buildLaneContext breadcrumbs", () => {
  it("returns the full fork/lane ancestry for a deeply-nested node", () => {
    const m = model(nestedDefinition());
    const ctx = buildLaneContext(m, "ent");
    expect(ctx).not.toBeNull();
    const crumbs = ctx!.breadcrumb.map((c) => `${c.forkNodeId}:${c.laneLabel}`);
    expect(crumbs).toEqual(["outer:true", "inner:true"]);
    // The innermost enclosing fork is 'inner', lane 'true'.
    expect(ctx!.forkNodeId).toBe("inner");
    expect(ctx!.laneLabel).toBe("true");
    expect(ctx!.depth).toBe(1); // inner fork is at depth 1
  });

  it("exposes sibling lanes of the innermost enclosing fork (with the active one flagged)", () => {
    const m = model(nestedDefinition());
    const ctx = buildLaneContext(m, "ent")!;
    const siblings = ctx.siblings.map((s) => ({ label: s.label, active: s.active, first: s.firstNodeId }));
    expect(siblings).toEqual([
      { label: "true", active: true, first: "ent" },
      { label: "false", active: false, first: "smb" },
    ]);
  });

  it("a top-level node has an empty breadcrumb and no siblings", () => {
    const m = model(nestedDefinition());
    const ctx = buildLaneContext(m, "outer")!;
    expect(ctx.breadcrumb).toEqual([]);
    expect(ctx.forkNodeId).toBeNull();
    expect(ctx.siblings).toEqual([]);
  });

  it("returns null for a stale/unknown node", () => {
    const m = model(nestedDefinition());
    expect(buildLaneContext(m, "ghost")).toBeNull();
  });
});

describe("findForkBlock / firstNodeIdOfBlocks", () => {
  it("locates a nested fork and reports its depth", () => {
    const m = model(nestedDefinition());
    expect(findForkBlock(m, "outer")?.depth).toBe(0);
    expect(findForkBlock(m, "inner")?.depth).toBe(1);
    expect(findForkBlock(m, "nope")).toBeNull();
  });

  it("firstNodeIdOfBlocks returns the first executable node in document order", () => {
    const m = model(nestedDefinition());
    const outer = findForkBlock(m, "outer")!;
    const trueLane = outer.lanes.find((l) => l.label === "true")!;
    // The true lane's first block is the nested 'inner' fork.
    expect(firstNodeIdOfBlocks(trueLane.blocks)).toBe("inner");
  });
});
