/**
 * @jest-environment node
 *
 * Tests for services/ai/patch/materializeAiPatchNodeIds
 * (Slice 4.BUILDER-NODE-IDENTITY-1).
 *
 * The id-materializer is the boundary that guarantees model-proposed node/edge
 * ids never persist: AI-created ids are patch-local scratch values, replaced
 * with system-owned ids (and every reference to them rewritten) before the
 * patch is validated or saved. References to ids that are neither on the canvas
 * nor introduced earlier in the same patch are rejected.
 */
import { materializeAiPatchNodeIds } from "@/services/ai/patch/materializeAiPatchNodeIds";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function patch(operations: PatchOperation[]): WorkflowPatch {
  return { patchId: "p1", workflowId: "wf1", baseRevision: "rev-1", operations, summary: "s", rationale: "r" };
}

/** Deterministic generators so assertions can pin the assigned system ids. */
function gens() {
  let n = 0;
  let e = 0;
  return {
    nodeIdGen: () => `sys-node-${++n}`,
    edgeIdGen: () => `sys-edge-${++e}`,
  };
}

const EMPTY: WorkflowDefinition = { nodes: [], edges: [] };

const existingDef: WorkflowDefinition = {
  nodes: [node("real-trigger", "trigger", "gmail", "new_email"), node("real-action", "action", "gmail", "send_email")],
  edges: [{ id: "real-edge", from: "real-trigger", to: "real-action" }],
};

describe("materializeAiPatchNodeIds — new-node id remapping", () => {
  it("replaces addNode + replaceTrigger patch-local ids with system ids; persisted patch contains neither model id", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "replaceTrigger", node: node("trigger1", "trigger", "gmail", "new_email") },
        { op: "addNode", node: node("action1", "action", "slack", "send_channel_message", { text: "hi" }) },
        { op: "addEdge", edge: { id: "edge1", from: "trigger1", to: "action1" } },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const serialized = JSON.stringify(res.patch);
    expect(serialized).not.toContain("trigger1");
    expect(serialized).not.toContain("action1");
    expect(serialized).not.toContain("edge1");
    expect(res.nodeIdMap).toEqual({ trigger1: "sys-node-1", action1: "sys-node-2" });
    expect(res.edgeIdMap).toEqual({ edge1: "sys-edge-1" });
  });

  it("rewrites edge from/to + edge id to the assigned system ids", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("t", "trigger", "gmail", "new_email") },
        { op: "addNode", node: node("a", "action", "slack", "send_channel_message") },
        { op: "addEdge", edge: { id: "e", from: "t", to: "a" } },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const edgeOp = res.patch.operations.find((o) => o.op === "addEdge");
    expect(edgeOp).toEqual({ op: "addEdge", edge: { id: "sys-edge-1", from: "sys-node-1", to: "sys-node-2" } });
  });

  it("rewrites {{patchLocalId.path}} variable tokens inside an added node's config", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("trig", "trigger", "gmail", "new_email") },
        { op: "addNode", node: node("act", "action", "slack", "send_channel_message", { text: "From {{trig.subject}} — {{AI_FIELD:summary}}" }) },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.patch.operations.find(
      (o) => o.op === "addNode" && o.node.provider === "slack",
    );
    expect(added?.op === "addNode" && added.node.config.text).toBe(
      "From {{sys-node-1.subject}} — {{AI_FIELD:summary}}",
    );
  });

  it("keeps a `{{trigger.field}}` keyword reference untouched (it is not a node id)", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("trig", "trigger", "gmail", "new_email") },
        { op: "addNode", node: node("act", "action", "slack", "send_channel_message", { text: "{{trigger.subject}}" }) },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.patch.operations.find((o) => o.op === "addNode" && o.node.provider === "slack");
    expect(added?.op === "addNode" && added.node.config.text).toBe("{{trigger.subject}}");
  });

  it("strips any AI-supplied displayName off created nodes (node names are user-only)", () => {
    const created = { ...node("a", "action", "slack", "send_channel_message"), displayName: "AI Picked Name" };
    const res = materializeAiPatchNodeIds(patch([{ op: "addNode", node: created }]), EMPTY, gens());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.patch.operations.find((o) => o.op === "addNode");
    expect(added?.op === "addNode" && "displayName" in added.node).toBe(false);
  });
});

describe("materializeAiPatchNodeIds — reference integrity", () => {
  it("remaps an updateNodeConfig that targets a node introduced earlier in the same patch", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("a", "action", "slack", "send_channel_message") },
        { op: "updateNodeConfig", nodeId: "a", config: { text: "hi" } },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const update = res.patch.operations.find((o) => o.op === "updateNodeConfig");
    expect(update?.op === "updateNodeConfig" && update.nodeId).toBe("sys-node-1");
  });

  it("rejects updateNodeConfig targeting an invented id with UNKNOWN_NODE (no remap)", () => {
    const res = materializeAiPatchNodeIds(
      patch([{ op: "updateNodeConfig", nodeId: "action1", config: { text: "hi" } }]),
      existingDef,
      gens(),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("UNKNOWN_NODE");
    expect(res.errors[0]!.nodeId).toBe("action1");
  });

  it("preserves an EXISTING canvas node id on updateNodeConfig (no remap)", () => {
    const res = materializeAiPatchNodeIds(
      patch([{ op: "updateNodeConfig", nodeId: "real-action", config: { subject: "Hi" } }]),
      existingDef,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const update = res.patch.operations.find((o) => o.op === "updateNodeConfig");
    expect(update?.op === "updateNodeConfig" && update.nodeId).toBe("real-action");
    expect(res.nodeIdMap).toEqual({});
  });

  it("rejects a within-patch duplicate patch-local id with DUPLICATE_NODE_ID", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("dup", "action", "slack", "send_channel_message") },
        { op: "addNode", node: node("dup", "action", "slack", "send_direct_message") },
      ]),
      EMPTY,
      gens(),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.code === "DUPLICATE_NODE_ID")).toBe(true);
  });

  it("rejects an addEdge endpoint that resolves to no node with INVALID_EDGE", () => {
    const res = materializeAiPatchNodeIds(
      patch([{ op: "addEdge", edge: { id: "e", from: "real-action", to: "ghost" } }]),
      existingDef,
      gens(),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.code === "INVALID_EDGE")).toBe(true);
  });

  it("wires a new node to an existing canvas node: new endpoint remapped, existing endpoint preserved", () => {
    const res = materializeAiPatchNodeIds(
      patch([
        { op: "addNode", node: node("a", "action", "slack", "send_channel_message") },
        { op: "addEdge", edge: { id: "e", from: "real-action", to: "a" } },
      ]),
      existingDef,
      gens(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const edgeOp = res.patch.operations.find((o) => o.op === "addEdge");
    expect(edgeOp?.op === "addEdge" && edgeOp.edge.from).toBe("real-action");
    expect(edgeOp?.op === "addEdge" && edgeOp.edge.to).toBe("sys-node-1");
  });
});
