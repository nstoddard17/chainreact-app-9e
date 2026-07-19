/**
 * @jest-environment node
 *
 * Canonical advanced-branching node classification (BRANCH-ENT-1).
 *
 * Business rule protected: the paid `advanced_branching` capability restricts EXACTLY
 * the route-selecting node types (If/Then Condition, Router) — never ordinary
 * actions/triggers, and never labeled edges by themselves. Every enforcement boundary
 * reuses this classifier, so a drift here would either let Free accounts obtain paid
 * branching or wrongly lock unrelated nodes.
 */

import {
  ADVANCED_BRANCHING_CAPABILITY,
  ADVANCED_BRANCHING_MIN_PLAN,
  ADVANCED_BRANCHING_NODE_TYPES,
  advancedBranchingNodeIds,
  definitionUsesAdvancedBranching,
  isAdvancedBranchingNode,
  isAdvancedBranchingTypeKey,
} from "@/core/workflows/advancedBranching";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

function node(
  id: string,
  provider: string,
  type: string,
  kind: "trigger" | "action" = "action",
) {
  return { id, kind, provider, type, config: {}, position: { x: 0, y: 0 } };
}

describe("advanced-branching node classification", () => {
  const table: Array<[provider: string, type: string, restricted: boolean, why: string]> = [
    ["native", "if_then_condition", true, "If/Then Condition (If/Else) selects between routes"],
    ["native", "router", true, "Router (multi-route / Else-If) selects between routes"],
    ["native", "delay", false, "ordinary native action"],
    ["native", "http_request", false, "ordinary native action"],
    ["native", "format_transformer", false, "ordinary native action"],
    ["native", "manual", false, "trigger types are never restricted"],
    ["slack", "send_channel_message", false, "provider action"],
    ["slack", "if_then_condition", false, "restriction is keyed on provider:type, not type alone"],
    ["native", "", false, "type-less transient node is not restricted"],
  ];

  it.each(table)(
    "%s:%s → restricted=%s (%s)",
    (provider, type, restricted) => {
      expect(isAdvancedBranchingNode({ provider, type })).toBe(restricted);
      expect(isAdvancedBranchingTypeKey(`${provider}:${type}`)).toBe(restricted);
    },
  );

  it("the canonical set contains exactly the two branching node types", () => {
    expect([...ADVANCED_BRANCHING_NODE_TYPES].sort()).toEqual([
      "native:if_then_condition",
      "native:router",
    ]);
  });

  it("capability id and minimum tier are stable identifiers", () => {
    expect(ADVANCED_BRANCHING_CAPABILITY).toBe("advanced_branching");
    expect(ADVANCED_BRANCHING_MIN_PLAN).toBe("pro");
  });
});

describe("definitionUsesAdvancedBranching", () => {
  it("detects an If/Then Condition node in a definition", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("t1", "native", "manual", "trigger"),
        node("if1", "native", "if_then_condition"),
        node("a1", "slack", "send_channel_message"),
      ],
      edges: [],
    };
    expect(definitionUsesAdvancedBranching(def)).toBe(true);
    expect(advancedBranchingNodeIds(def)).toEqual(["if1"]);
  });

  it("detects a Router node and reports every branching node id in order", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("r1", "native", "router"),
        node("a1", "native", "delay"),
        node("if1", "native", "if_then_condition"),
      ],
      edges: [],
    };
    expect(definitionUsesAdvancedBranching(def)).toBe(true);
    expect(advancedBranchingNodeIds(def)).toEqual(["r1", "if1"]);
  });

  it("a linear workflow of ordinary triggers/actions is NOT restricted", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("t1", "native", "manual", "trigger"),
        node("a1", "slack", "send_channel_message"),
        node("a2", "native", "http_request"),
      ],
      edges: [
        { id: "e1", from: "t1", to: "a1" },
        { id: "e2", from: "a1", to: "a2" },
      ],
    };
    expect(definitionUsesAdvancedBranching(def)).toBe(false);
    expect(advancedBranchingNodeIds(def)).toEqual([]);
  });

  it("labeled edges WITHOUT a branching node do not restrict the definition", () => {
    // Labeled edges are an engine primitive other nodes may legitimately use;
    // the capability gates the product feature (the branching NODES), not edges.
    const def: WorkflowDefinition = {
      nodes: [node("a1", "native", "delay"), node("a2", "native", "delay")],
      edges: [{ id: "e1", from: "a1", to: "a2", label: "true" }],
    };
    expect(definitionUsesAdvancedBranching(def)).toBe(false);
  });

  it("empty definition is not restricted", () => {
    expect(definitionUsesAdvancedBranching({ nodes: [] })).toBe(false);
  });
});
