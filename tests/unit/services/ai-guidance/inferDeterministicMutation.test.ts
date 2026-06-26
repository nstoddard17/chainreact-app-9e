/**
 * @jest-environment node
 *
 * DEMOTED Slack↔email mutation fallback (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * Proves the narrow, SECONDARY fallback emits GENERAL `WorkflowPatch` operations (remove + add + re-edge)
 * referencing STABLE node ids — never a special apply path, never "the first Slack action". It asks
 * WHICH step when two could match, asks Gmail-vs-Outlook when ambiguous, reports a catalog gap, and
 * declines non-change requests. The general pipeline (proposeWorkflowMutation) validates the ops.
 */
const mockGetActionMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (k: string) => mockGetActionMeta(k),
  getTriggerMeta: (k: string) => jest.requireActual("@/services/discovery/_registry").getTriggerMeta(k),
}));

import { inferDeterministicMutationOps } from "@/services/ai-guidance/fallback/inferDeterministicMutation";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

const realRegistry = jest.requireActual("@/services/discovery/_registry") as typeof import("@/services/discovery/_registry");
beforeEach(() => {
  mockGetActionMeta.mockReset().mockImplementation((k: string) => realRegistry.getActionMeta(k));
});

function draft(nodes: WorkflowDefinition["nodes"], edges: WorkflowDefinition["edges"] = []): WorkflowDefinition {
  return { nodes, edges };
}
const slackNode = (id: string) => ({ id, kind: "action" as const, provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } });
const triggerNode = { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } };
const manualSlack = () => draft([triggerNode, slackNode("a1")], [{ id: "e1", from: "t1", to: "a1" }]);

describe("inferDeterministicMutationOps — Slack → email", () => {
  it("explicit Gmail → general ops: removeNode(a1) + addNode(gmail:send_email) + re-edge from the trigger", () => {
    const res = inferDeterministicMutationOps({ goalText: "change it to a gmail email", currentDraft: manualSlack() });
    expect(res.kind).toBe("ops");
    if (res.kind !== "ops") return;
    expect(res.operations.some((o) => o.op === "removeNode" && o.nodeId === "a1")).toBe(true);
    const add = res.operations.find((o) => o.op === "addNode");
    expect(add && add.op === "addNode" && `${add.node.provider}:${add.node.type}`).toBe("gmail:send_email");
    // Re-edge preserves wiring: an addEdge from the trigger to the new node (patch-local id).
    expect(res.operations.some((o) => o.op === "addEdge" && o.edge.from === "t1")).toBe(true);
  });

  it("no provider named + BOTH connected → asks Gmail vs Outlook (no ops)", () => {
    const res = inferDeterministicMutationOps({ goalText: "change it to an email notification", currentDraft: manualSlack(), connectedEmailProviders: ["gmail", "microsoft-outlook"] });
    expect(res.kind).toBe("needs_provider_choice");
  });

  it("no provider named + exactly ONE connected → uses it", () => {
    const res = inferDeterministicMutationOps({ goalText: "change it to an email notification", currentDraft: manualSlack(), connectedEmailProviders: ["gmail"] });
    expect(res.kind).toBe("ops");
  });

  it("MORE THAN ONE Slack step → asks WHICH one (never guesses by provider/type)", () => {
    const d = draft([triggerNode, slackNode("a1"), slackNode("a2")], [{ id: "e1", from: "t1", to: "a1" }, { id: "e2", from: "a1", to: "a2" }]);
    const res = inferDeterministicMutationOps({ goalText: "change it to a gmail email", currentDraft: d });
    expect(res.kind).toBe("needs_node_choice");
  });

  it("no email send action in the catalog → catalog gap", () => {
    mockGetActionMeta.mockImplementation((k: string) => (k === "gmail:send_email" || k === "microsoft-outlook:send_email" ? undefined : realRegistry.getActionMeta(k)));
    const res = inferDeterministicMutationOps({ goalText: "change it to an email", currentDraft: manualSlack() });
    expect(res.kind).toBe("catalog_gap");
  });
});

describe("inferDeterministicMutationOps — email → Slack + declines", () => {
  it("swaps a single email step to Slack via general ops", () => {
    const d = draft([triggerNode, { id: "a1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } }], [{ id: "e1", from: "t1", to: "a1" }]);
    const res = inferDeterministicMutationOps({ goalText: "change it to a slack message instead", currentDraft: d });
    expect(res.kind).toBe("ops");
    if (res.kind !== "ops") return;
    const add = res.operations.find((o) => o.op === "addNode");
    expect(add && add.op === "addNode" && `${add.node.provider}:${add.node.type}`).toBe("slack:send_channel_message");
  });

  it("declines a non-change request / empty draft", () => {
    expect(inferDeterministicMutationOps({ goalText: "looks great", currentDraft: manualSlack() }).kind).toBe("none");
    expect(inferDeterministicMutationOps({ goalText: "change it to email", currentDraft: draft([]) }).kind).toBe("none");
  });
});
