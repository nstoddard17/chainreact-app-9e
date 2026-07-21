/**
 * Pure map navigation outcomes (5.DUAL-BUILDER-1 / CS-3).
 *
 * Typed, non-throwing decisions: a supported field row → scroll + Guided Stop;
 * a node-setup row → inspector; a complex / wiring / structural row → Visual
 * Builder; a stale id or structural connector → an explicit safe refusal.
 */
import { resolveMapRowNavigation } from "@/features/workflow-builder/document/documentNavigation";
import type { WholeWorkflowMapRow } from "@/features/workflow-builder/document/wholeWorkflowMapModel";
import type { SetupQueueHandoff } from "@/features/workflow-builder/document/setupQueueModel";

function row(over: Partial<WholeWorkflowMapRow>): WholeWorkflowMapRow {
  return {
    key: "k",
    kind: "step",
    nodeId: "n1",
    depth: 0,
    title: "Step",
    subtitle: null,
    crumbs: [],
    status: "ready",
    queueItemIds: [],
    firstFieldKey: null,
    handoff: null,
    complexReason: null,
    focusNodeId: "n1",
    ...over,
  };
}
const handoff = (over: Partial<SetupQueueHandoff>): SetupQueueHandoff => ({
  id: "h",
  nodeId: "n1",
  issueCode: "unconfigured_node",
  reason: "node_setup",
  message: "x",
  focusNodeId: "n1",
  ...over,
});
const live = new Set(["n1"]);

describe("resolveMapRowNavigation", () => {
  it("ready node with no stops → scroll", () => {
    expect(resolveMapRowNavigation(row({}), live)).toEqual({ kind: "scroll", nodeId: "n1" });
  });

  it("node with a supported field stop → scroll_and_edit", () => {
    expect(
      resolveMapRowNavigation(row({ firstFieldKey: "channel", queueItemIds: ["n1::channel"], status: "needs_detail" }), live),
    ).toEqual({ kind: "scroll_and_edit", nodeId: "n1", fieldKey: "channel" });
  });

  it("node-setup handoff → open_inspector", () => {
    expect(
      resolveMapRowNavigation(row({ handoff: handoff({ reason: "node_setup" }), status: "needs_detail" }), live),
    ).toEqual({ kind: "open_inspector", nodeId: "n1" });
  });

  it("structural handoff → open_in_visual", () => {
    expect(
      resolveMapRowNavigation(row({ handoff: handoff({ reason: "structural", focusNodeId: "n1" }), status: "structural_issue" }), live),
    ).toEqual({ kind: "open_in_visual", nodeId: "n1" });
  });

  it("complex region row → open_in_visual with focus node", () => {
    expect(
      resolveMapRowNavigation(row({ kind: "complex", nodeId: null, focusNodeId: "n9", status: "unsupported" }), new Set(["n9"])),
    ).toEqual({ kind: "open_in_visual", nodeId: "n9" });
  });

  it("lane warning row → open_in_visual", () => {
    expect(
      resolveMapRowNavigation(row({ kind: "lane", nodeId: null, status: "warning", focusNodeId: "fork1" }), live),
    ).toEqual({ kind: "open_in_visual", nodeId: "fork1" });
  });

  it("stale node id → refuse", () => {
    expect(resolveMapRowNavigation(row({ nodeId: "gone" }), live)).toEqual({
      kind: "refuse",
      reason: "stale_node",
    });
  });

  it("structural connector (nodeId null) → refuse", () => {
    expect(resolveMapRowNavigation(row({ kind: "terminal", nodeId: null, status: "ready" }), live)).toEqual({
      kind: "refuse",
      reason: "structural_connector",
    });
  });

  it("never throws for any row shape", () => {
    const shapes: WholeWorkflowMapRow[] = [
      row({}),
      row({ nodeId: null, kind: "rejoin" }),
      row({ handoff: handoff({ reason: "branch_wiring" }) }),
      row({ kind: "complex", nodeId: null, focusNodeId: null }),
    ];
    for (const r of shapes) expect(() => resolveMapRowNavigation(r, live)).not.toThrow();
  });
});
