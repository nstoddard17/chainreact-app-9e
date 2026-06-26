/**
 * @jest-environment node
 *
 * Human-readable proposed-edit summary (HERMES-AGENT-WORKFLOW-EDITOR). The rail copy on a successful
 * edit — a safe sentence from catalog display names, never raw refs/JSON/config.
 */

import { summarizeProposedEdit } from "@/services/ai-guidance/mutation/summarizeProposedEdit";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

const node = (id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}) =>
  ({ id, kind, provider, type, config, position: { x: 0, y: 0 } });

const manualSlack: WorkflowDefinition = {
  nodes: [node("t1", "trigger", "native", "manual.run"), node("a1", "action", "slack", "send_channel_message", { channel: "C1" })],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};

describe("summarizeProposedEdit", () => {
  it("describes a 1:1 action swap as a replacement, with the Apply hint", () => {
    const proposed: WorkflowDefinition = {
      nodes: [node("t1", "trigger", "native", "manual.run"), node("email", "action", "gmail", "send_email")],
      edges: [{ id: "e2", from: "t1", to: "email" }],
    };
    const s = summarizeProposedEdit(manualSlack, proposed);
    expect(s).toMatch(/replace the Slack.*with a Gmail/i);
    expect(s).toMatch(/Apply preview/i);
    // No ids / refs / config leak.
    expect(s).not.toContain("a1");
    expect(s).not.toContain("C1");
  });

  it("describes adding a step", () => {
    const proposed: WorkflowDefinition = {
      nodes: [...manualSlack.nodes, node("d", "action", "native", "delay", { seconds: 5 })],
      edges: [...manualSlack.edges, { id: "e2", from: "a1", to: "d" }],
    };
    expect(summarizeProposedEdit(manualSlack, proposed)).toMatch(/add a .*Delay step/i);
  });

  it("describes a trigger change", () => {
    const proposed: WorkflowDefinition = {
      nodes: [node("nt", "trigger", "gmail", "new_email"), manualSlack.nodes[1]!],
      edges: [{ id: "e3", from: "nt", to: "a1" }],
    };
    expect(summarizeProposedEdit(manualSlack, proposed)).toMatch(/change the trigger to Gmail/i);
  });
});
