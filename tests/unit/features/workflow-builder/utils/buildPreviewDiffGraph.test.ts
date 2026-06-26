/**
 * @jest-environment node
 *
 * Pure preview diff/composition layer (HERMES-AGENT-PREVIEW-DIFF-GRAPH). One graph, diff-tagged,
 * non-overlapping — the Slack→Gmail replacement must read as Slack removed + Gmail added in their OWN
 * slots, never stacked.
 */

import { buildPreviewDiffGraph } from "@/features/workflow-builder/utils/buildPreviewDiffGraph";
import type { WorkflowDefinition } from "@/contracts/workflow";

const node = (id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}, pos = { x: 0, y: 0 }) =>
  ({ id, kind, provider, type, config, position: pos });

/** manual.run (t1) → slack:send_channel_message (a1). */
function manualSlack(): WorkflowDefinition {
  return {
    nodes: [node("t1", "trigger", "native", "manual.run", {}, { x: 400, y: 100 }), node("a1", "action", "slack", "send_channel_message", { channel: "C1" }, { x: 400, y: 300 })],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };
}

function posKey(p: { x: number; y: number }) {
  return `${Math.round(p.x)}:${Math.round(p.y)}`;
}

describe("buildPreviewDiffGraph — Slack→Gmail replacement", () => {
  const current = manualSlack();
  // Candidate: Slack (a1) removed, Gmail added with a NEW id, re-wired from the trigger.
  const candidate: WorkflowDefinition = {
    nodes: [node("t1", "trigger", "native", "manual.run", {}, { x: 400, y: 100 }), node("email-1", "action", "gmail", "send_email", {}, { x: 0, y: 0 })],
    edges: [{ id: "e2", from: "t1", to: "email-1" }],
  };
  const diff = buildPreviewDiffGraph(current, candidate);

  it("tags Manual unchanged, Slack removed, Gmail added", () => {
    const byId = new Map(diff.nodes.map((n) => [n.id, n]));
    expect(byId.get("t1")!.diffStatus).toBe("unchanged");
    expect(byId.get("a1")!.diffStatus).toBe("removed");
    expect(byId.get("email-1")!.diffStatus).toBe("added");
  });

  it("tags the old edge removed and the new edge added", () => {
    const edge = (from: string, to: string) => diff.edges.find((e) => e.from === from && e.to === to);
    expect(edge("t1", "a1")!.diffStatus).toBe("removed");
    expect(edge("t1", "email-1")!.diffStatus).toBe("added");
  });

  it("gives every node a DISTINCT position — removed Slack never stacks on added Gmail", () => {
    const slots = diff.nodes.map((n) => posKey(n.position));
    expect(new Set(slots).size).toBe(diff.nodes.length); // no two nodes share a slot
    const byId = new Map(diff.nodes.map((n) => [n.id, n]));
    expect(posKey(byId.get("a1")!.position)).not.toBe(posKey(byId.get("email-1")!.position));
  });

  it("places the removed Slack node beside (not on top of) its Gmail replacement", () => {
    const byId = new Map(diff.nodes.map((n) => [n.id, n]));
    const gmail = byId.get("email-1")!;
    const slack = byId.get("a1")!;
    expect(slack.position.x).toBeGreaterThan(gmail.position.x); // to the side
  });
});

describe("buildPreviewDiffGraph — other diff classes", () => {
  it("an unchanged node stays unchanged; an added node is added (pure addition)", () => {
    const current = manualSlack();
    const candidate: WorkflowDefinition = {
      nodes: [...current.nodes, node("d", "action", "native", "delay", { seconds: 5 }, { x: 0, y: 0 })],
      edges: [...current.edges, { id: "e3", from: "a1", to: "d" }],
    };
    const diff = buildPreviewDiffGraph(current, candidate);
    const byId = new Map(diff.nodes.map((n) => [n.id, n]));
    expect(byId.get("t1")!.diffStatus).toBe("unchanged");
    expect(byId.get("a1")!.diffStatus).toBe("unchanged");
    expect(byId.get("d")!.diffStatus).toBe("added");
    expect(diff.edges.find((e) => e.to === "d")!.diffStatus).toBe("added");
  });

  it("a same-id node with changed config is tagged changed", () => {
    const current = manualSlack();
    const candidate: WorkflowDefinition = {
      nodes: [current.nodes[0]!, node("a1", "action", "slack", "send_channel_message", { channel: "C2" }, { x: 400, y: 300 })],
      edges: current.edges,
    };
    const diff = buildPreviewDiffGraph(current, candidate);
    expect(diff.nodes.find((n) => n.id === "a1")!.diffStatus).toBe("changed");
  });

  it("config key order does not produce a false 'changed'", () => {
    const current: WorkflowDefinition = { nodes: [node("a1", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" })], edges: [] };
    const candidate: WorkflowDefinition = { nodes: [node("a1", "action", "slack", "send_channel_message", { text: "hi", channel: "C1" })], edges: [] };
    expect(buildPreviewDiffGraph(current, candidate).nodes[0]!.diffStatus).toBe("unchanged");
  });
});

/**
 * Capability-swap rule (product rule): a provider:type change is a REPLACEMENT — old `removed` + new
 * `added`, NEVER a single orange `changed` card — even when a proposal REUSES the old node's id for the
 * new capability. Same provider:type with only config edits stays `changed`.
 */
describe("buildPreviewDiffGraph — capability swap that reuses the node id", () => {
  const current = manualSlack();
  // Candidate REUSES Slack's id `a1` but with a different provider:type (gmail:send_email) — and keeps
  // the trigger edge pointing at `a1`. Without normalization this would collapse to one orange "changed".
  const candidate: WorkflowDefinition = {
    nodes: [node("t1", "trigger", "native", "manual.run", {}, { x: 400, y: 100 }), node("a1", "action", "gmail", "send_email", {}, { x: 400, y: 300 })],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };
  const diff = buildPreviewDiffGraph(current, candidate);

  it("splits the reused id into the old Slack node removed and the new Gmail node added (not 'changed')", () => {
    // The original id stays on the REMOVED Slack node (still labeled slack:send_channel_message)…
    const oldNode = diff.nodes.find((n) => n.provider === "slack" && n.type === "send_channel_message")!;
    expect(oldNode.id).toBe("a1");
    expect(oldNode.diffStatus).toBe("removed");
    // …and the new Gmail node is ADDED under a distinct (synthetic) display id.
    const newNode = diff.nodes.find((n) => n.provider === "gmail" && n.type === "send_email")!;
    expect(newNode.diffStatus).toBe("added");
    expect(newNode.id).not.toBe("a1");
    // Never a single 'changed' card for the swap.
    expect(diff.nodes.some((n) => n.diffStatus === "changed")).toBe(false);
  });

  it("marks the old edge removed and the new (re-keyed) edge added", () => {
    const newNode = diff.nodes.find((n) => n.provider === "gmail")!;
    expect(diff.edges.find((e) => e.from === "t1" && e.to === "a1")!.diffStatus).toBe("removed");
    expect(diff.edges.find((e) => e.from === "t1" && e.to === newNode.id)!.diffStatus).toBe("added");
  });

  it("gives the removed and added replacement nodes distinct, non-overlapping positions", () => {
    const slots = diff.nodes.map((n) => posKey(n.position));
    expect(new Set(slots).size).toBe(diff.nodes.length);
    const oldNode = diff.nodes.find((n) => n.provider === "slack")!;
    const newNode = diff.nodes.find((n) => n.provider === "gmail")!;
    expect(posKey(oldNode.position)).not.toBe(posKey(newNode.position));
    expect(oldNode.position.x).toBeGreaterThan(newNode.position.x); // removed sits beside its replacement
  });

  it("leaves Manual Run unchanged", () => {
    expect(diff.nodes.find((n) => n.id === "t1")!.diffStatus).toBe("unchanged");
  });
});
