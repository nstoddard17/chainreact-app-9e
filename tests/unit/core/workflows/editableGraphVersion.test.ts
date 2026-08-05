/**
 * @jest-environment node
 *
 * Deterministic draft version digest (HERMES-AGENT-WORKFLOW-EDITOR-LIVE). The shared stale-detection
 * token both the server (proposal) and client (Apply guard) compute. Must be deterministic + key-order
 * independent, and flip on any structural OR config change.
 */

import { computeEditableGraphVersion, isEditableGraphVersion } from "@/core/workflows/editableGraphVersion";

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

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — the fingerprint is the canonical answer to "is this
 * the same graph?", so it must be stable across everything that is NOT a semantic change, and it
 * must have a recognizable shape so it can never be silently confused with a revision timestamp.
 */
describe("computeEditableGraphVersion — canonical set semantics", () => {
  it("is independent of node and edge ARRAY order (a graph is a set, not a sequence)", () => {
    const v1 = computeEditableGraphVersion(base);
    const twoEdges = {
      nodes: base.nodes,
      edges: [{ id: "e", from: "t", to: "a" }, { id: "e2", from: "a", to: "t" }],
    };
    const reversed = {
      nodes: [...base.nodes].reverse(),
      edges: [...twoEdges.edges].reverse(),
    };
    expect(computeEditableGraphVersion({ ...twoEdges })).toBe(
      computeEditableGraphVersion({ nodes: reversed.nodes, edges: reversed.edges }),
    );
    expect(computeEditableGraphVersion({ ...base, nodes: [...base.nodes].reverse() })).toBe(v1);
  });

  it("ignores transient builder state that is not part of the definition", () => {
    const v1 = computeEditableGraphVersion(base);
    const withNoise = {
      ...base,
      // Fields the builder carries at runtime but that are not semantic graph content.
      nodes: base.nodes.map((n) => ({ ...n, selected: true, dragging: true, readiness: "ok" })),
    } as unknown as typeof base;
    expect(computeEditableGraphVersion(withNoise)).toBe(v1);
  });

  it("preserves meaningful node configuration", () => {
    const v1 = computeEditableGraphVersion(base);
    const changed = {
      ...base,
      nodes: [base.nodes[0]!, { ...base.nodes[1]!, config: { channel: "C1", text: "different" } }],
    };
    expect(computeEditableGraphVersion(changed)).not.toBe(v1);
  });

  it("LAYOUT IS SEMANTIC (documented decision): moving a node changes the fingerprint", () => {
    // Apply replaces the whole definition, positions included, so a moved node is a real edit a
    // stale proposal must not silently clobber.
    const v1 = computeEditableGraphVersion(base);
    const moved = {
      ...base,
      nodes: [base.nodes[0]!, { ...base.nodes[1]!, position: { x: 999, y: 999 } }],
    };
    expect(computeEditableGraphVersion(moved)).not.toBe(v1);
  });

  it("produces a recognizable 8-char hex shape that a timestamp can never satisfy", () => {
    expect(isEditableGraphVersion(computeEditableGraphVersion(base))).toBe(true);
    expect(isEditableGraphVersion("2026-07-29T10:00:00.000Z")).toBe(false);
    expect(isEditableGraphVersion(null)).toBe(false);
    expect(isEditableGraphVersion("")).toBe(false);
  });
});
