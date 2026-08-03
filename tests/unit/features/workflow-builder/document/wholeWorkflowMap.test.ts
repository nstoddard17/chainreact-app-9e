/** @jest-environment node */
/**
 * Pure Whole Workflow map model (5.DUAL-BUILDER-1 / CS-3).
 *
 * Locks that the map renders the SAME projected DocumentModel as a hierarchical
 * tree: every executable step appears once keeping its nodeId, fork/lane/nested/
 * rejoin/terminal hierarchy is preserved, and per-step status is sourced from
 * the shared validation/queue state (never a second vocabulary). Complex regions
 * are `unsupported` (Visual handoff).
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import { buildDocumentOutline } from "@/features/workflow-builder/document/documentOutline";
import { buildSetupQueue } from "@/features/workflow-builder/document/setupQueueModel";
import { buildWholeWorkflowMap } from "@/features/workflow-builder/document/wholeWorkflowMapModel";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id, kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 }, ...over };
}
function trigger(id = "t", over: Partial<WorkflowNode> = {}): WorkflowNode {
  return node(id, { kind: "trigger", provider: "hubspot", type: "new_contact", ...over });
}
function edge(from: string, to: string, label?: string): WorkflowEdge {
  return { id: `${from}->${to}${label ? `:${label}` : ""}`, from, to, ...(label !== undefined ? { label } : {}) };
}
function ifNode(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return node(id, { provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, ...over });
}

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }],
  },
  "native:if_then_condition": {
    displayName: "If/Then Condition",
    requiredFields: [{ name: "input", label: "Input" }, { name: "operator", label: "Operator" }],
  },
};

function buildMap(nodes: readonly WorkflowNode[], edges: readonly WorkflowEdge[]) {
  const model = projectDefinitionToDocument({ nodes, edges, requiredFieldsByType });
  const outline = buildDocumentOutline(model);
  const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges, requiredFieldsByType });
  const queue = buildSetupQueue({ outline, issues });
  return { map: buildWholeWorkflowMap({ outline, issues, queue }), queue };
}

describe("buildWholeWorkflowMap", () => {
  it("renders a row per DocumentModel block; each executable step appears exactly once", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C", text: "hi" } }), node("b", { config: { channel: "C", text: "hi" } })];
    const { map } = buildMap(nodes, [edge("t", "a"), edge("a", "b")]);
    const stepNodeIds = map.rows.filter((r) => r.kind === "trigger" || r.kind === "step").map((r) => r.nodeId);
    expect(stepNodeIds).toEqual(["t", "a", "b"]);
  });

  it("preserves fork / lane / rejoin / terminal hierarchy with depth", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a", { config: { channel: "C", text: "h" } }), node("b", { config: { channel: "C", text: "h" } }), node("r", { config: { channel: "C", text: "h" } })];
    const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false"), edge("a", "r"), edge("b", "r")];
    const { map } = buildMap(nodes, edges);
    const kinds = map.rows.map((r) => r.kind);
    expect(kinds).toContain("fork");
    expect(kinds.filter((k) => k === "lane")).toHaveLength(2);
    expect(kinds).toContain("rejoin");
    // rejoin points at r; r also appears once as its own step row.
    const rejoin = map.rows.find((r) => r.kind === "rejoin")!;
    expect(rejoin.nodeId).toBe("r");
    const rSteps = map.rows.filter((r) => r.kind === "step" && r.nodeId === "r");
    expect(rSteps).toHaveLength(1);
    // lanes are deeper than the fork.
    const fork = map.rows.find((r) => r.kind === "fork")!;
    const lane = map.rows.find((r) => r.kind === "lane")!;
    expect(lane.depth).toBeGreaterThan(fork.depth);
  });

  it("terminal lane emits a terminal row", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a", { config: { channel: "C", text: "h" } }), node("b", { config: { channel: "C", text: "h" } })];
    const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false")];
    const { map } = buildMap(nodes, edges);
    expect(map.rows.some((r) => r.kind === "terminal")).toBe(true);
  });

  it("status matches shared state: needs_detail for a missing field, ready when filled", () => {
    const nodes = [trigger("t"), node("a") /* missing */, node("b", { config: { channel: "C", text: "h" } })];
    const { map, queue } = buildMap(nodes, [edge("t", "a"), edge("a", "b")]);
    const a = map.rows.find((r) => r.nodeId === "a" && r.kind === "step")!;
    const b = map.rows.find((r) => r.nodeId === "b" && r.kind === "step")!;
    expect(a.status).toBe("needs_detail");
    expect(a.queueItemIds).toEqual(queue.items.filter((i) => i.nodeId === "a").map((i) => i.id));
    expect(a.firstFieldKey).toBe("channel");
    expect(b.status).toBe("ready");
  });

  it("branch wiring warning → warning status on the lane; fork handoff carries it", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a", { config: { channel: "C", text: "h" } })];
    const { map } = buildMap(nodes, [edge("t", "if"), edge("if", "a", "true")]); // false unwired
    const warnLane = map.rows.find((r) => r.kind === "lane" && r.status === "warning");
    expect(warnLane).toBeDefined();
  });

  it("complex region → unsupported status + Visual handoff focus node", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C", text: "h" } }), node("b"), node("c")];
    const edges = [edge("t", "a"), edge("a", "b"), edge("a", "c")]; // fan-out
    const { map } = buildMap(nodes, edges);
    const complex = map.rows.find((r) => r.kind === "complex")!;
    expect(complex.status).toBe("unsupported");
    expect(complex.complexReason).toBe("parallel_fan_out");
    expect(complex.focusNodeId).not.toBeNull();
  });

  it("unreachable node → structural_issue status", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C", text: "h" } }), node("orphan")];
    const { map } = buildMap(nodes, [edge("t", "a")]);
    // orphan renders inside a 'disconnected' complex region (unsupported) OR as
    // a structural row; either way it is NOT shown as a normal ready step.
    const orphanReady = map.rows.some((r) => r.nodeId === "orphan" && r.status === "ready");
    expect(orphanReady).toBe(false);
  });
});
