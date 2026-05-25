/**
 * @jest-environment node
 *
 * Tests for features/workflow-builder/canvas/adapters.
 *
 * Pure conversion helpers between the contract WorkflowNode/Edge shapes
 * and ReactFlow's FlowNode/FlowEdge shapes. Slice 3.5 ships them as a
 * sibling to WorkflowCanvas so the canvas component can call them
 * inside useMemo without thinking about synchronization edge cases.
 */

import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import {
  WORKFLOW_NODE_TYPE,
  flowNodePositionPatch,
  workflowEdgesToFlowEdges,
  workflowNodesToFlowNodes,
} from "@/features/workflow-builder/canvas/adapters";

const triggerNode: WorkflowNode = {
  id: "trig-1",
  kind: "trigger",
  provider: "slack",
  type: "message_received",
  config: {},
  position: { x: 0, y: 0 },
};

const actionNode: WorkflowNode = {
  id: "act-1",
  kind: "action",
  provider: "github",
  type: "add_comment",
  config: { repository: "octocat/hello-world" },
  position: { x: 120, y: 240 },
};

describe("workflowNodesToFlowNodes", () => {
  it("converts a contract WorkflowNode list into FlowNode[] with the custom node type", () => {
    const flowNodes = workflowNodesToFlowNodes([triggerNode, actionNode]);
    expect(flowNodes).toHaveLength(2);
    expect(flowNodes[0]).toMatchObject({
      id: "trig-1",
      type: WORKFLOW_NODE_TYPE,
      position: { x: 0, y: 0 },
      data: {
        kind: "trigger",
        provider: "slack",
        type: "message_received",
      },
    });
    expect(flowNodes[1]).toMatchObject({
      id: "act-1",
      type: WORKFLOW_NODE_TYPE,
      position: { x: 120, y: 240 },
      data: {
        kind: "action",
        provider: "github",
        type: "add_comment",
      },
    });
  });

  it("populates `providerLabel` when a label map is supplied", () => {
    const flowNodes = workflowNodesToFlowNodes([triggerNode], {
      providerLabels: { slack: "Slack" },
    });
    expect(flowNodes[0]!.data.providerLabel).toBe("Slack");
  });

  it("leaves `providerLabel` undefined when the label map has no entry", () => {
    const flowNodes = workflowNodesToFlowNodes([triggerNode], {
      providerLabels: { gmail: "Gmail" },
    });
    expect(flowNodes[0]!.data.providerLabel).toBeUndefined();
  });

  it("returns [] for an empty input — does not throw", () => {
    expect(workflowNodesToFlowNodes([])).toEqual([]);
  });

  it("does NOT embed the full WorkflowNode in `data` (single-source-of-truth invariant)", () => {
    const flowNodes = workflowNodesToFlowNodes([actionNode]);
    // The narrow projection must NOT include `config` or `position`
    // (those live on the FlowNode itself, not nested in `data`).
    expect(flowNodes[0]!.data).not.toHaveProperty("config");
    expect(flowNodes[0]!.data).not.toHaveProperty("position");
    expect(flowNodes[0]!.data).not.toHaveProperty("id");
  });
});

describe("workflowEdgesToFlowEdges", () => {
  const baseEdge: WorkflowEdge = {
    id: "edge-1",
    from: "trig-1",
    to: "act-1",
  };

  it("converts a contract WorkflowEdge into FlowEdge with source/target", () => {
    const flowEdges = workflowEdgesToFlowEdges([baseEdge]);
    expect(flowEdges).toHaveLength(1);
    expect(flowEdges[0]).toMatchObject({
      id: "edge-1",
      source: "trig-1",
      target: "act-1",
    });
    // Unlabeled edges must NOT carry a `label` property.
    expect(flowEdges[0]).not.toHaveProperty("label");
  });

  it("surfaces optional branch labels as the FlowEdge label", () => {
    const labeled: WorkflowEdge = { ...baseEdge, label: "if-true" };
    const flowEdges = workflowEdgesToFlowEdges([labeled]);
    expect(flowEdges[0]!.label).toBe("if-true");
  });

  it("returns [] for an empty input", () => {
    expect(workflowEdgesToFlowEdges([])).toEqual([]);
  });
});

describe("flowNodePositionPatch", () => {
  it("extracts the (id, position) tuple for graphSlice.updateNodePosition", () => {
    expect(
      flowNodePositionPatch({ id: "act-1", position: { x: 42, y: 96 } }),
    ).toEqual({ nodeId: "act-1", position: { x: 42, y: 96 } });
  });
});
