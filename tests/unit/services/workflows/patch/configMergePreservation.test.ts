/** @jest-environment node */
/**
 * Config merge integrity (REACT-CONFIG-COVERAGE-1, Part F).
 *
 * Pins that editing ONE field never erases unrelated required/optional configuration:
 *   - `updateNodeConfig` merges by default (explicit `replace: true` is the only full replacement);
 *   - the full edit pipeline (`runWorkflowEditFromModel`) preserves untouched nodes' and fields'
 *     values, including explicit `false` / `0`;
 *   - a `repairVariableReference` on one field leaves every other field intact (repair preservation).
 */
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { runWorkflowEditFromModel } from "@/services/ai-guidance/mutation/runWorkflowEditFromModel";

const DRAFT: WorkflowDefinition = {
  nodes: [
    {
      id: "trigger-1",
      kind: "trigger",
      provider: "gmail",
      type: "new_email",
      config: {
        from: ["vendor@example.com"],
        subject: "Invoice",
        subjectExactMatch: false,
        labelIds: ["INBOX"],
      },
      position: { x: 0, y: 0 },
    },
    {
      id: "action-1",
      kind: "action",
      provider: "slack",
      type: "send_channel_message",
      config: { channel: "C123", text: "hello" },
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", from: "trigger-1", to: "action-1" }],
};

function patch(operations: WorkflowPatch["operations"]): WorkflowPatch {
  return {
    patchId: "p1",
    workflowId: null,
    baseRevision: "r1",
    operations,
    summary: "",
    rationale: "",
  } as WorkflowPatch;
}

describe("updateNodeConfig merge semantics", () => {
  it("merges one changed field and preserves every unrelated optional field (incl. explicit false)", () => {
    const result = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "trigger-1", config: { subject: "Receipt" } }]),
      DRAFT,
    );
    expect(result.ok).toBe(true);
    const node = result.candidateDefinition!.nodes.find((n) => n.id === "trigger-1")!;
    expect(node.config).toEqual({
      from: ["vendor@example.com"],
      subject: "Receipt",
      subjectExactMatch: false,
      labelIds: ["INBOX"],
    });
  });

  it("replaces wholesale ONLY under explicit replace: true", () => {
    const result = validateWorkflowPatch(
      patch([
        { op: "updateNodeConfig", nodeId: "action-1", config: { channel: "C999", text: "x" }, replace: true },
      ]),
      DRAFT,
    );
    expect(result.ok).toBe(true);
    const node = result.candidateDefinition!.nodes.find((n) => n.id === "action-1")!;
    expect(node.config).toEqual({ channel: "C999", text: "x" });
  });

  it("repairVariableReference touches only its field (repair preservation)", () => {
    const result = validateWorkflowPatch(
      patch([
        { op: "repairVariableReference", nodeId: "action-1", fieldPath: "text", newReference: "{{trigger-1.subject}}" },
      ]),
      DRAFT,
    );
    expect(result.ok).toBe(true);
    const node = result.candidateDefinition!.nodes.find((n) => n.id === "action-1")!;
    expect(node.config.channel).toBe("C123");
    expect(node.config.text).toBe("{{trigger-1.subject}}");
  });
});

describe("full edit pipeline preservation (runWorkflowEditFromModel)", () => {
  it("an edit to one node preserves all other nodes' optional config exactly", () => {
    const built = buildEditableWorkflowGraph(DRAFT);
    // The model edits the SLACK message text via the opaque ref; the gmail trigger's four optional
    // fields must survive untouched in the proposed end-state.
    const actionRef = built.graph.nodes.find((n) => n.provider === "slack")!.ref;
    const result = runWorkflowEditFromModel({
      currentDraft: DRAFT,
      editableGraph: built,
      operations: [{ op: "updateNodeConfig", nodeId: actionRef, config: { text: "updated" } }],
    });
    expect(result.kind).toBe("proposal");
    if (result.kind !== "proposal") return;
    const trigger = result.proposedDefinition.nodes.find((n) => n.id === "trigger-1")!;
    expect(trigger.config).toEqual({
      from: ["vendor@example.com"],
      subject: "Invoice",
      subjectExactMatch: false,
      labelIds: ["INBOX"],
    });
    const action = result.proposedDefinition.nodes.find((n) => n.id === "action-1")!;
    expect(action.config).toEqual({ channel: "C123", text: "updated" });
  });
});
