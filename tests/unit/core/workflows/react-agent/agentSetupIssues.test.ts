import type { WorkflowNode } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import {
  buildAgentSetupIssues,
  hasBlockingSetupIssue,
} from "@/core/workflows/agentSetupIssues";

/**
 * CHECKLIST-ITEM-10 — the pure read-model that turns agent-touched nodes with empty
 * required fields (and broken variable references) into actionable, safe "Setup
 * needed" issues. Derived from the SAME readiness rule as the header pill / Activate
 * gate; never fabricates a reason; never leaks values / secrets.
 */

function node(over: Partial<WorkflowNode> & Pick<WorkflowNode, "id">): WorkflowNode {
  return {
    kind: "action",
    provider: "gmail",
    type: "send_email",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  };
}

const requiredFieldsByType: RequiredFieldsByType = {
  "gmail:send_email": {
    displayName: "Gmail",
    requiredFields: [
      { name: "to", label: "To" },
      { name: "subject", label: "Subject" },
    ],
  },
  "slack:send_message": {
    displayName: "Slack",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "retries", label: "Retries", hasDefault: true },
    ],
  },
};

describe("buildAgentSetupIssues — missing required fields", () => {
  it("emits one blocking issue per empty required field, naming node + field", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1" })],
      requiredFieldsByType,
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      kind: "missing_required_field",
      workflowId: "wf1",
      nodeId: "n1",
      // nodeLabel is the node-identity label (no custom name / no meta passed here →
      // the formatted type key); actionLabel is the provider/action display name.
      nodeLabel: "Send Email",
      actionLabel: "Gmail",
      fieldPath: "to",
      fieldLabel: "To",
      message: "Gmail needs a To.",
      blocking: true,
      focusTarget: { nodeId: "n1", fieldPath: "to" },
    });
    expect(issues[1]!.fieldPath).toBe("subject");
  });

  it("drops an issue once the field is filled (recomputes from live config)", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1", config: { to: "a@b.com" } })],
      requiredFieldsByType,
    });
    expect(issues.map((i) => i.fieldPath)).toEqual(["subject"]);
  });

  it("Q5: 0 / false / empty-string-after-trim are handled like the readiness rule", () => {
    // `0` is an explicit value (not missing); "" / "   " ARE missing.
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1", config: { to: 0, subject: "   " } })],
      requiredFieldsByType,
    });
    expect(issues.map((i) => i.fieldPath)).toEqual(["subject"]);
  });

  it("never reports a required field that declares a metadata default (hasDefault)", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["s1"],
      nodes: [node({ id: "s1", provider: "slack", type: "send_message" })],
      requiredFieldsByType,
    });
    // channel is missing (blocking); retries has a default → never an issue.
    expect(issues.map((i) => i.fieldPath)).toEqual(["channel"]);
  });

  it("uses a safe GENERIC explanation — never a fabricated specific inference reason", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1" })],
      requiredFieldsByType,
    });
    for (const issue of issues) {
      expect(issue.explanation).toContain("didn't have enough information");
      // Must NOT claim a specific source it cannot prove.
      expect(issue.explanation).not.toMatch(/Slack message|previous step|old message|infer/i);
    }
  });

  it("never leaks config values / secrets — only field names + labels appear", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1", config: { subject: "S-SECRET-123" } })],
      requiredFieldsByType,
    });
    expect(JSON.stringify(issues)).not.toContain("S-SECRET-123");
  });
});

describe("buildAgentSetupIssues — unknown type (no metadata)", () => {
  it("emits a single NON-blocking review issue with node-level focus", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["x"],
      nodes: [node({ id: "x", provider: "acme", type: "do_thing" })],
      requiredFieldsByType,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "unknown",
      blocking: false,
      focusTarget: { nodeId: "x" },
    });
    expect(issues[0]!.focusTarget?.fieldPath).toBeUndefined();
  });
});

describe("buildAgentSetupIssues — broken variable reference", () => {
  it("maps a deleted-source reference to a non-blocking unresolved_variable issue", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [
        node({ id: "n1", config: { to: "a@b.com", subject: "{{ghost.value}}" } }),
      ],
      requiredFieldsByType,
    });
    const broken = issues.find((i) => i.kind === "unresolved_variable");
    expect(broken).toMatchObject({
      nodeId: "n1",
      fieldPath: "subject",
      blocking: false,
      focusTarget: { nodeId: "n1", fieldPath: "subject" },
    });
    // The deleted source id is not echoed into the message.
    expect(broken!.message).not.toContain("ghost");
  });

  it("does NOT flag a reference to an existing node or the trigger alias", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [
        node({ id: "t", kind: "trigger", config: {} }),
        node({ id: "n1", config: { to: "{{trigger.from}}", subject: "{{t.value}}" } }),
      ],
      requiredFieldsByType,
    });
    expect(issues.some((i) => i.kind === "unresolved_variable")).toBe(false);
  });
});

describe("buildAgentSetupIssues — boundaries", () => {
  it("returns [] for no reported nodes", () => {
    expect(
      buildAgentSetupIssues({ workflowId: "wf1", nodeIds: [], nodes: [], requiredFieldsByType }),
    ).toEqual([]);
  });

  it("skips ids that no longer exist; preserves nodeIds order", () => {
    const issues = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["gone", "b", "a"],
      nodes: [node({ id: "a" }), node({ id: "b", provider: "slack", type: "send_message" })],
      requiredFieldsByType,
    });
    expect(issues.map((i) => i.nodeId)).toEqual(["b", "a", "a"]);
  });

  it("hasBlockingSetupIssue reflects whether any required-field gap exists", () => {
    const blocking = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["n1"],
      nodes: [node({ id: "n1" })],
      requiredFieldsByType,
    });
    const nonBlocking = buildAgentSetupIssues({
      workflowId: "wf1",
      nodeIds: ["x"],
      nodes: [node({ id: "x", provider: "acme", type: "do_thing" })],
      requiredFieldsByType,
    });
    expect(hasBlockingSetupIssue(blocking)).toBe(true);
    expect(hasBlockingSetupIssue(nonBlocking)).toBe(false);
  });
});
