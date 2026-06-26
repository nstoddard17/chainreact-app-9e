/**
 * @jest-environment node
 *
 * Deterministic draft version digest (HERMES-AGENT-WORKFLOW-EDITOR-LIVE). The shared stale-detection
 * token both the server (proposal) and client (Apply guard) compute. Must be deterministic + key-order
 * independent, and flip on any structural OR config change.
 */

import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";

const base = {
  nodes: [
    { id: "t", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e", from: "t", to: "a" }],
};

describe("computeEditableGraphVersion", () => {
  it("is deterministic + independent of config key order", () => {
    const v1 = computeEditableGraphVersion(base);
    const reordered = { ...base, nodes: [base.nodes[0]!, { ...base.nodes[1]!, config: { text: "hi", channel: "C1" } }] };
    expect(computeEditableGraphVersion(reordered)).toBe(v1);
  });

  it("flips when a config VALUE changes", () => {
    const v1 = computeEditableGraphVersion(base);
    const edited = { ...base, nodes: [base.nodes[0]!, { ...base.nodes[1]!, config: { channel: "C2", text: "hi" } }] };
    expect(computeEditableGraphVersion(edited)).not.toBe(v1);
  });

  it("flips when a node or edge is added", () => {
    const v1 = computeEditableGraphVersion(base);
    expect(computeEditableGraphVersion({ ...base, edges: [] })).not.toBe(v1);
    expect(
      computeEditableGraphVersion({
        ...base,
        nodes: [...base.nodes, { id: "b", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 0, y: 0 } }],
      }),
    ).not.toBe(v1);
  });
});
