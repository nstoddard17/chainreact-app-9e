/**
 * Branch source-handle model (BRANCH-ENT-1 C4).
 *
 * Business rule protected: handle IDS carry route identity — an edge drawn
 * from `branch:<label>` means exactly that route, and the rendered handle set
 * always matches what the node's config can return (plus stale labels still
 * carried by edges, so nothing is ever invisibly dangling). Visual position
 * and edge array order are never the source of truth.
 */

import {
  BRANCH_ALWAYS_HANDLE_ID,
  branchHandleId,
  branchLabelDisplay,
  computeBranchHandleLabels,
  labelFromBranchHandle,
} from "@/features/workflow-builder/utils/branchHandles";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

function node(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
  kind: "trigger" | "action" = "action",
  provider = "native",
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

describe("handle id round-trip", () => {
  it("branchHandleId ↔ labelFromBranchHandle round-trips a route label", () => {
    expect(labelFromBranchHandle(branchHandleId("true"))).toBe("true");
    expect(labelFromBranchHandle(branchHandleId("vip customers"))).toBe(
      "vip customers",
    );
  });

  it("default handle (null/undefined) and the Always handle mean an unlabeled cleanup edge", () => {
    expect(labelFromBranchHandle(null)).toBeUndefined();
    expect(labelFromBranchHandle(undefined)).toBeUndefined();
    expect(labelFromBranchHandle(BRANCH_ALWAYS_HANDLE_ID)).toBeUndefined();
    expect(labelFromBranchHandle("")).toBeUndefined();
    // A foreign handle id (not branch-scheme) never fabricates a label.
    expect(labelFromBranchHandle("some-other-handle")).toBeUndefined();
    expect(labelFromBranchHandle("branch:")).toBeUndefined();
  });

  it("true/false display as True/False; router labels display verbatim", () => {
    expect(branchLabelDisplay("true")).toBe("True");
    expect(branchLabelDisplay("false")).toBe("False");
    expect(branchLabelDisplay("VIP")).toBe("VIP");
  });
});

describe("computeBranchHandleLabels", () => {
  it("If/Then with onFalse=branch exposes true+false; skip exposes only true", () => {
    const branchIf = node("if1", "if_then_condition", { onFalse: "branch" });
    const skipIf = node("if2", "if_then_condition", { onFalse: "skip" });
    const map = computeBranchHandleLabels([branchIf, skipIf], []);
    expect(map.get("if1")).toEqual(["true", "false"]);
    expect(map.get("if2")).toEqual(["true"]);
  });

  it("Router exposes route labels + defaultRoute in config order", () => {
    const router = node("r1", "router", {
      routes: [{ label: "vip" }, { label: "standard" }],
      defaultRoute: "other",
    });
    const map = computeBranchHandleLabels([router], []);
    expect(map.get("r1")).toEqual(["vip", "standard", "other"]);
  });

  it("stale labels still carried by existing edges stay visible as extra handles", () => {
    const skipIf = node("if1", "if_then_condition", { onFalse: "skip" });
    const edges: WorkflowEdge[] = [
      { id: "e1", from: "if1", to: "a1", label: "false" }, // stale after switching to skip
    ];
    const map = computeBranchHandleLabels([skipIf, node("a1", "delay")], edges);
    expect(map.get("if1")).toEqual(["true", "false"]);
  });

  it("non-branching nodes are absent (they keep the single default handle)", () => {
    const map = computeBranchHandleLabels(
      [node("t1", "manual", {}, "trigger"), node("a1", "delay")],
      [{ id: "e1", from: "t1", to: "a1" }],
    );
    expect(map.size).toBe(0);
  });

  it("an unconfigured Router still gets an entry (Always handle only) so cleanup wiring stays possible", () => {
    const map = computeBranchHandleLabels([node("r1", "router")], []);
    expect(map.get("r1")).toEqual([]);
  });
});
