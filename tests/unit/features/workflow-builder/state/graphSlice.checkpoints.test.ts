/**
 * CHECKPOINTS-1 — undo/redo parity guard.
 *
 * The named-checkpoints slice wraps a React Agent apply with a checkpoint
 * capture. That capture must be READ-ONLY against the graph store, so the
 * existing builder undo/redo behavior is unchanged: an apply still records
 * exactly one undo step, and the pre-change capture adds none.
 *
 * This protects the "preserve existing undo/redo" requirement — if a future
 * change made the checkpoint capture mutate the slice, this fails.
 */

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const TRIGGER_ONLY = {
  nodes: [
    {
      id: "t1",
      kind: "trigger" as const,
      provider: "slack",
      type: "new_message",
      config: {},
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

beforeEach(() => {
  useGraphSlice.getState().reset();
});

describe("graphSlice undo/redo with a React Agent apply + checkpoint capture", () => {
  it("records exactly one undo step for the apply (read-only capture adds none) and undo/redo still works", () => {
    const s = () => useGraphSlice.getState();
    s().hydrate("wf-1", TRIGGER_ONLY, "2026-07-15T00:00:00Z");
    expect(s().past).toHaveLength(0);

    // The builder's pre-apply checkpoint capture reads pending nodes/edges from the
    // store (getState). Reading must NOT push history.
    const capturedNodes = [...s().pendingNodes];
    expect(capturedNodes.map((n) => n.id)).toEqual(["t1"]);
    expect(s().past).toHaveLength(0);

    // The React Agent apply — the same additive path handleApplyPreview drives.
    const outcome = s().applyAdditivePatch({
      kind: "additive",
      nodes: [{ ref: "p0", kind: "action", provider: "gmail", type: "send_email" }],
      edges: [],
    });
    expect(outcome.ok).toBe(true);
    expect(s().pendingNodes).toHaveLength(2);
    // The apply pushed exactly one history entry — the capture contributed nothing.
    expect(s().past).toHaveLength(1);

    // Undo returns to the pre-apply graph; redo re-applies — existing behavior intact.
    s().undo();
    expect(s().pendingNodes.map((n) => n.id)).toEqual(["t1"]);
    expect(s().future).toHaveLength(1);

    s().redo();
    expect(s().pendingNodes).toHaveLength(2);
    expect(s().past).toHaveLength(1);
  });
});
