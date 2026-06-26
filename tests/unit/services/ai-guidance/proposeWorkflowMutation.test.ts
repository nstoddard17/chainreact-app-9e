/**
 * @jest-environment node
 *
 * General conversational workflow-mutation proposal (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * Proves the GENERAL pipeline (model/fallback ops → materialize → validateWorkflowPatch(localDraft) →
 * candidate end-state + preview) across every edit class, using STABLE node refs + the REAL catalog —
 * no phrase matching. Atomic: a partially-valid proposal never previews. Apply target = the candidate.
 */
import { proposeWorkflowMutation } from "@/services/ai-guidance/mutation/proposeWorkflowMutation";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { PatchOperation } from "@/services/workflows/patch/types";

// Deterministic id generators so new-node/edge ids are assertable.
let nodeN = 0;
let edgeN = 0;
const gens = { nodeIdGen: () => `n${++nodeN}`, edgeIdGen: () => `g${++edgeN}` };
beforeEach(() => {
  nodeN = 0;
  edgeN = 0;
});

/** manual.run (t1) → slack:send_channel_message (a1). */
function manualSlackDraft(): WorkflowDefinition {
  return {
    nodes: [
      { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 160 } },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };
}
const node = (id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}) =>
  ({ id, kind, provider, type, config, position: { x: 0, y: 0 } });

function propose(draft: WorkflowDefinition, operations: PatchOperation[]) {
  return proposeWorkflowMutation({ currentDraft: draft, operations }, gens);
}
function keys(def: WorkflowDefinition): string[] {
  return def.nodes.map((n) => `${n.provider}:${n.type}`);
}

describe("proposeWorkflowMutation — general edit classes", () => {
  it("replace Slack with email (removeNode + addNode + addEdge) → candidate swaps, no append", () => {
    const res = propose(manualSlackDraft(), [
      { op: "removeNode", nodeId: "a1" },
      { op: "addNode", node: node("new1", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne1", from: "t1", to: "new1" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(keys(res.proposedDefinition)).toEqual(["native:manual.run", "gmail:send_email"]);
    expect(res.proposedDefinition.nodes.some((n) => n.provider === "slack")).toBe(false);
    expect(res.proposedDefinition.edges).toHaveLength(1);
  });

  it("add a delay BEFORE an existing action (split the edge atomically)", () => {
    const res = propose(manualSlackDraft(), [
      { op: "removeEdge", edgeId: "e1" },
      { op: "addNode", node: node("d", "action", "native", "delay") },
      { op: "addEdge", edge: { id: "ce1", from: "t1", to: "d" } },
      { op: "addEdge", edge: { id: "ce2", from: "d", to: "a1" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(keys(res.proposedDefinition)).toEqual(["native:manual.run", "slack:send_channel_message", "native:delay"]);
    // Order trigger → delay → slack (the delay sits between).
    const id = (p: string, t: string) => res.proposedDefinition.nodes.find((n) => n.provider === p && n.type === t)!.id;
    const e = res.proposedDefinition.edges;
    expect(e.some((x) => x.from === "t1" && x.to === id("native", "delay"))).toBe(true);
    expect(e.some((x) => x.from === id("native", "delay") && x.to === "a1")).toBe(true);
    expect(e.some((x) => x.from === "t1" && x.to === "a1")).toBe(false); // old direct edge gone
  });

  it("remove a specified action by stable id", () => {
    const res = propose(manualSlackDraft(), [{ op: "removeNode", nodeId: "a1" }]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(keys(res.proposedDefinition)).toEqual(["native:manual.run"]);
    expect(res.proposedDefinition.edges).toHaveLength(0); // cascade
  });

  it("update an existing node's editable config (merge)", () => {
    const res = propose(manualSlackDraft(), [{ op: "updateNodeConfig", nodeId: "a1", config: { channel: "C999" } }]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    const slack = res.proposedDefinition.nodes.find((n) => n.id === "a1")!;
    expect(slack.config).toEqual({ channel: "C999", text: "hi" }); // merged, text preserved
  });

  it("change the trigger while preserving downstream actions + wiring", () => {
    const res = propose(manualSlackDraft(), [
      { op: "replaceTrigger", node: node("nt", "trigger", "gmail", "new_email") },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(res.proposedDefinition.nodes.filter((n) => n.kind === "trigger").map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email"]);
    // Downstream Slack action preserved + still wired from the new trigger.
    const trig = res.proposedDefinition.nodes.find((n) => n.kind === "trigger")!;
    expect(res.proposedDefinition.edges.some((e) => e.from === trig.id && e.to === "a1")).toBe(true);
    expect(res.proposedDefinition.nodes.some((n) => n.id === "a1")).toBe(true);
  });

  it("add a SECOND notification without replacing the first", () => {
    const res = propose(manualSlackDraft(), [
      { op: "addNode", node: node("em", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne", from: "t1", to: "em" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(keys(res.proposedDefinition).sort()).toEqual(["gmail:send_email", "native:manual.run", "slack:send_channel_message"]);
  });

  it("applies multiple requested changes together (atomic)", () => {
    const res = propose(manualSlackDraft(), [
      { op: "updateNodeConfig", nodeId: "a1", config: { channel: "C2" } },
      { op: "addNode", node: node("em", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne", from: "a1", to: "em" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(res.proposedDefinition.nodes.find((n) => n.id === "a1")!.config).toMatchObject({ channel: "C2" });
    expect(res.proposedDefinition.nodes.some((n) => n.provider === "gmail")).toBe(true);
    expect(res.proposedDefinition.edges.some((e) => e.from === "a1")).toBe(true);
  });
});

describe("proposeWorkflowMutation — validation + safety", () => {
  it("missing ordinary config does NOT block — it becomes 'needs setup' in the preview", () => {
    // gmail:send_email requires `to`; we add it with no config → still a proposal, with a needs-setup hint.
    const res = propose(manualSlackDraft(), [
      { op: "addNode", node: node("em", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne", from: "t1", to: "em" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    const emailPreview = res.previewDraft.nodes.find((n) => n.type === "send_email")!;
    expect(emailPreview.missingInputs).toContain("to");
  });

  it("an UNSUPPORTED capability is rejected with an actionable, secret-free reason (no preview)", () => {
    const res = propose(manualSlackDraft(), [
      { op: "addNode", node: node("x", "action", "totallymadeup", "do_magic") },
      { op: "addEdge", edge: { id: "ne", from: "t1", to: "x" } },
    ]);
    expect(res.kind).toBe("invalid");
    if (res.kind !== "invalid") return;
    expect(res.message).toMatch(/not a registered|not in the|catalog|does not expose/i);
    expect(res.message).not.toMatch(/secret|token|credential/i);
  });

  it("an op referencing an UNKNOWN node id is rejected (no silent guess)", () => {
    const res = propose(manualSlackDraft(), [{ op: "removeNode", nodeId: "does-not-exist" }]);
    expect(res.kind).toBe("invalid");
    if (res.kind !== "invalid") return;
    expect(res.message).toMatch(/not in the workflow|unknown/i);
  });

  it("never turns a requested replacement into an accidental append (remove+add yields a swap, not 3 nodes)", () => {
    const res = propose(manualSlackDraft(), [
      { op: "removeNode", nodeId: "a1" },
      { op: "addNode", node: node("em", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne", from: "t1", to: "em" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(res.proposedDefinition.nodes).toHaveLength(2); // trigger + email, NOT trigger+slack+email
  });

  it("no operations → noop", () => {
    expect(propose(manualSlackDraft(), []).kind).toBe("noop");
  });

  // HERMES-AGENT-RAIL-EDIT-PREVIEW-CLEANUP — the user-facing `warnings` must never leak internal patch
  // wording / raw ids. The structural risk warnings (DELETES_USER_WORK / ORPHANS_DOWNSTREAM) that the
  // validator emits for a removeNode embed the raw node id and are already conveyed by the human summary,
  // so they are filtered OUT of the surfaced warnings.
  it("does not surface id-bearing structural warnings (no 'Node <id> and its edges are removed.')", () => {
    const res = propose(manualSlackDraft(), [
      { op: "removeNode", nodeId: "a1" },
      { op: "addNode", node: node("em", "action", "gmail", "send_email") },
      { op: "addEdge", edge: { id: "ne", from: "t1", to: "em" } },
    ]);
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    const joined = res.warnings.join(" | ");
    expect(joined).not.toMatch(/and its edges are removed/i);
    expect(joined).not.toMatch(/\ba1\b/); // no raw node id
    expect(joined).not.toMatch(/inbound path|disconnects|removes node/i); // no internal structural wording
  });
});
