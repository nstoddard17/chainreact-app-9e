/**
 * @jest-environment node
 *
 * Tests for services/execution/branching.ts — the pure per-edge
 * selection rule + outgoing-edge index. The engine integration tests
 * in engine.test.ts cover the same rule end-to-end via runWorkflow;
 * these tests pin the rule in isolation so a refactor that breaks the
 * branching semantics fails here first (smaller blast radius).
 *
 * See docs/slices/parity/engine-branching-plan.md §4.1.
 */
import {
  buildOutgoingEdgeMap,
  selectActivatedEdges,
} from "@/services/execution/branching";
import type { WorkflowEdge } from "@/contracts/workflow";

function edge(
  id: string,
  from: string,
  to: string,
  label?: string,
): WorkflowEdge {
  return label === undefined
    ? { id, from, to }
    : { id, from, to, label };
}

describe("buildOutgoingEdgeMap", () => {
  it("returns an empty map for no edges", () => {
    const map = buildOutgoingEdgeMap([]);
    expect(map.size).toBe(0);
  });

  it("groups edges by their `from` node id, preserving label", () => {
    const e1 = edge("e1", "a", "b");
    const e2 = edge("e2", "a", "c", "yes");
    const e3 = edge("e3", "b", "d", "no");
    const map = buildOutgoingEdgeMap([e1, e2, e3]);
    expect(map.get("a")).toEqual([e1, e2]);
    expect(map.get("b")).toEqual([e3]);
    expect(map.get("c")).toBeUndefined();
  });

  it("preserves edge insertion order within a bucket", () => {
    const e1 = edge("e1", "a", "b", "one");
    const e2 = edge("e2", "a", "c", "two");
    const e3 = edge("e3", "a", "d", "three");
    const map = buildOutgoingEdgeMap([e1, e2, e3]);
    expect(map.get("a")).toEqual([e1, e2, e3]);
  });
});

describe("selectActivatedEdges — unlabeled edges (legacy / always-follow)", () => {
  const e1 = edge("e1", "a", "b");
  const e2 = edge("e2", "a", "c");

  it("activates every unlabeled edge when branchTaken is undefined", () => {
    const r = selectActivatedEdges([e1, e2], undefined);
    expect(r.activated).toEqual(["b", "c"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("activates every unlabeled edge when branchTaken is null", () => {
    const r = selectActivatedEdges([e1, e2], null);
    expect(r.activated).toEqual(["b", "c"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("activates every unlabeled edge when branchTaken is a string (string has nothing to match)", () => {
    // No labeled edges → string branchTaken has no candidate to match → still
    // invalidBranch because the handler asserted a decision that no edge can carry.
    const r = selectActivatedEdges([e1, e2], "anything");
    expect(r.activated).toEqual(["b", "c"]);
    expect(r.invalidBranch).toBe(true);
  });

  it("returns empty arrays for an empty edge list", () => {
    const r = selectActivatedEdges([], undefined);
    expect(r.activated).toEqual([]);
    expect(r.invalidBranch).toBe(false);
  });
});

describe("selectActivatedEdges — labeled edges", () => {
  const yes = edge("e1", "a", "b", "yes");
  const no = edge("e2", "a", "c", "no");

  it("activates only the matching labeled edge", () => {
    const r = selectActivatedEdges([yes, no], "yes");
    expect(r.activated).toEqual(["b"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("activates the alternate labeled edge when branchTaken switches", () => {
    const r = selectActivatedEdges([yes, no], "no");
    expect(r.activated).toEqual(["c"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("activates no labeled edges when branchTaken is null", () => {
    const r = selectActivatedEdges([yes, no], null);
    expect(r.activated).toEqual([]);
    expect(r.invalidBranch).toBe(false);
  });

  it("activates no labeled edges when branchTaken is undefined (§6.2.a permissive)", () => {
    const r = selectActivatedEdges([yes, no], undefined);
    expect(r.activated).toEqual([]);
    expect(r.invalidBranch).toBe(false);
  });

  it("sets invalidBranch when branchTaken doesn't match any labeled edge", () => {
    const r = selectActivatedEdges([yes, no], "maybe");
    expect(r.activated).toEqual([]);
    expect(r.invalidBranch).toBe(true);
  });
});

describe("selectActivatedEdges — fan-out within a branch (same label, multiple targets)", () => {
  it("activates every edge that shares the matching label", () => {
    const e1 = edge("e1", "a", "b", "match");
    const e2 = edge("e2", "a", "c", "match");
    const e3 = edge("e3", "a", "d", "other");
    const r = selectActivatedEdges([e1, e2, e3], "match");
    expect(r.activated).toEqual(["b", "c"]);
    expect(r.invalidBranch).toBe(false);
  });
});

describe("selectActivatedEdges — mixed labeled + unlabeled", () => {
  const cleanup = edge("e1", "a", "CLEANUP");
  const yes = edge("e2", "a", "Y", "yes");
  const no = edge("e3", "a", "N", "no");

  it("matching string branchTaken activates the label PLUS unlabeled", () => {
    const r = selectActivatedEdges([cleanup, yes, no], "yes");
    expect(r.activated).toEqual(["CLEANUP", "Y"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("null branchTaken activates ONLY the unlabeled (post-branch always-run)", () => {
    const r = selectActivatedEdges([cleanup, yes, no], null);
    expect(r.activated).toEqual(["CLEANUP"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("undefined branchTaken activates ONLY the unlabeled (§6.2.a permissive)", () => {
    const r = selectActivatedEdges([cleanup, yes, no], undefined);
    expect(r.activated).toEqual(["CLEANUP"]);
    expect(r.invalidBranch).toBe(false);
  });

  it("non-matching string branchTaken still activates the unlabeled, but flags invalidBranch", () => {
    // Edge case: invalidBranch surfaces the handler bug even though
    // unlabeled traversal would otherwise proceed. The engine converts
    // invalidBranch=true into a step failure regardless of activated.
    const r = selectActivatedEdges([cleanup, yes, no], "maybe");
    expect(r.activated).toEqual(["CLEANUP"]);
    expect(r.invalidBranch).toBe(true);
  });
});
