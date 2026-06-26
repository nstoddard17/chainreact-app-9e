/**
 * @jest-environment node
 *
 * Diff-graph → ReactFlow adapters (HERMES-AGENT-PREVIEW-DIFF-GRAPH). The composed diff graph becomes
 * ONE read-only ReactFlow node/edge set carrying `diffStatus` — never a separate overlay.
 */

import { previewDiffToFlowEdges, previewDiffToFlowNodes } from "@/features/workflow-builder/canvas/adapters";
import type { PreviewDiffGraph } from "@/features/workflow-builder/utils/buildPreviewDiffGraph";

const graph: PreviewDiffGraph = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 400, y: 100 }, diffStatus: "unchanged" },
    { id: "email-1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 400, y: 300 }, diffStatus: "added" },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 760, y: 300 }, diffStatus: "removed" },
  ],
  edges: [
    { id: "e2", from: "t1", to: "email-1", diffStatus: "added" },
    { id: "e1", from: "t1", to: "a1", diffStatus: "removed" },
  ],
};

describe("previewDiffToFlowNodes / previewDiffToFlowEdges", () => {
  it("carries diffStatus into node data and marks every node READ-ONLY", () => {
    const flow = previewDiffToFlowNodes(graph);
    expect(flow.map((n) => n.data.diffStatus)).toEqual(["unchanged", "added", "removed"]);
    for (const n of flow) {
      expect(n.draggable).toBe(false);
      expect(n.connectable).toBe(false);
      expect(n.selectable).toBe(false);
      expect(n.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    }
    // The removed node keeps its OWN slot (never the added node's position).
    const added = flow.find((n) => n.data.diffStatus === "added")!;
    const removed = flow.find((n) => n.data.diffStatus === "removed")!;
    expect(removed.position).not.toEqual(added.position);
  });

  it("a removed node never nags about config (missingRequiredConfig false)", () => {
    const flow = previewDiffToFlowNodes(graph);
    expect(flow.find((n) => n.data.diffStatus === "removed")!.data.missingRequiredConfig).toBe(false);
  });

  it("carries diffStatus into edge data with unique RF ids", () => {
    const flow = previewDiffToFlowEdges(graph);
    expect(flow.map((e) => (e.data as { diffStatus: string }).diffStatus)).toEqual(["added", "removed"]);
    expect(new Set(flow.map((e) => e.id)).size).toBe(flow.length); // unique ids
    for (const e of flow) expect(e.selectable).toBe(false);
  });
});
