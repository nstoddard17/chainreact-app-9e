/**
 * @jest-environment node
 *
 * Opaque editable-graph refs → real ids (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * Pins the translation contract directly: existing node/edge refs rewrite to real ids; new_ refs pass
 * through; config `{{ref.path}}` tokens rewrite; and an invented / real-id / unknown-edge ref is REJECTED
 * (never a silent guess).
 */

import { resolveEditableGraphRefs } from "@/services/ai-guidance/mutation/resolveEditableGraphRefs";
import type { PatchOperation } from "@/services/workflows/patch/types";

const refMap = new Map([
  ["node_1", "real-trigger"],
  ["node_2", "real-slack"],
]);
const edgeRefMap = new Map([["edge_1", "real-edge"]]);

describe("resolveEditableGraphRefs", () => {
  it("rewrites existing node refs in op targets + edge endpoints to real ids", () => {
    const ops: PatchOperation[] = [
      { op: "updateNodeConfig", nodeId: "node_2", config: { channel: "C" } },
      { op: "addNode", node: { id: "new_x", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } },
      { op: "addEdge", edge: { id: "e1", from: "node_1", to: "new_x" } },
    ];
    const res = resolveEditableGraphRefs(ops, refMap, edgeRefMap);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.operations[0] as { nodeId: string }).nodeId).toBe("real-slack");
    expect((res.operations[2] as { edge: { from: string; to: string } }).edge).toMatchObject({ from: "real-trigger", to: "new_x" });
  });

  it("rewrites a `{{node_ref.path}}` variable token in config to the real id", () => {
    const ops: PatchOperation[] = [
      { op: "updateNodeConfig", nodeId: "node_2", config: { text: "Hi {{node_1.userName}}!" } },
    ];
    const res = resolveEditableGraphRefs(ops, refMap, edgeRefMap);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.operations[0] as unknown as { config: { text: string } }).config.text).toBe("Hi {{real-trigger.userName}}!");
  });

  it("maps an existing edge ref to its real edge id for removeEdge", () => {
    const res = resolveEditableGraphRefs([{ op: "removeEdge", edgeId: "edge_1" }], refMap, edgeRefMap);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.operations[0] as { edgeId: string }).edgeId).toBe("real-edge");
  });

  it("REJECTS an invented node ref", () => {
    const res = resolveEditableGraphRefs([{ op: "removeNode", nodeId: "node_42" }], refMap, edgeRefMap);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/no longer in your current workflow/i);
    expect(res.message).not.toContain("node_42"); // raw ref must never leak into the message
  });

  it("REJECTS a real id the model should never have produced", () => {
    const res = resolveEditableGraphRefs([{ op: "removeNode", nodeId: "real-slack" }], refMap, edgeRefMap);
    expect(res.ok).toBe(false);
  });

  it("REJECTS an unknown edge ref for removeEdge", () => {
    const res = resolveEditableGraphRefs([{ op: "removeEdge", edgeId: "edge_9" }], refMap, edgeRefMap);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/connection .* no longer in your current workflow/i);
  });

  it("REJECTS adding a node that reuses an existing ref", () => {
    const res = resolveEditableGraphRefs(
      [{ op: "addNode", node: { id: "node_1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } } }],
      refMap,
      edgeRefMap,
    );
    expect(res.ok).toBe(false);
  });
});
