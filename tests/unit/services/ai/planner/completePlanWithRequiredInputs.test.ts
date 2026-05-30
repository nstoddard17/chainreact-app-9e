/**
 * @jest-environment node
 *
 * Slice 4.AI-35B — deterministic required-input completion service.
 *
 * NO model client is mocked or imported — the service never calls a model.
 * Only `getWorkflowGraphForAI` is mocked (the real AI-3 validator + AI-5 preview
 * run against the live registry). These pin: existing-node recipient edit
 * (Slack DM), config completion on an existing node, no_target_node fallback,
 * no_answers, workflow_not_found, and preview_rejected → fall back to re-plan.
 */
const mockGetWorkflowGraphForAI = jest.fn();
jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetWorkflowGraphForAI(...a),
}));

import { completePlanWithRequiredInputs } from "@/services/ai/planner/completePlanWithRequiredInputs";
import type { WorkflowPatch } from "@/services/workflows/patch/types";

const REVISION = "2026-05-27T00:00:00Z";

function gnode(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function graphResult(nodes: ReturnType<typeof gnode>[], edges: { id: string; from: string; to: string }[] = []) {
  return {
    ok: true as const,
    data: { workflowId: "wf1", name: "WF", state: "draft", activeRevisionId: null, updatedAt: REVISION, nodes, edges },
  };
}

beforeEach(() => {
  mockGetWorkflowGraphForAI.mockReset();
});

describe("existing Slack DM recipient edit (the AI-35 #3 fix)", () => {
  it("builds an updateNodeConfig on the existing node, previews apply-ready, NO model call", async () => {
    // Existing canvas: Gmail trigger → Slack DM (with a complete, valid config).
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult(
        [
          gnode("t1", "trigger", "gmail", "new_email", {}),
          gnode("n_dm", "action", "slack", "send_direct_message", { userId: "U_OLD", text: "hello" }),
        ],
        [{ id: "e1", from: "t1", to: "n_dm" }],
      ),
    );

    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null, // null patch — the edit is derived from the current canvas
      answers: [{ nodeId: "n_dm", field: "userId", value: "user123" }],
      currentGraph: {
        nodes: [{ id: "n_dm", kind: "action", provider: "slack", type: "send_direct_message" }],
        edges: [],
      },
      intentSummary: "Send the DM to a different person.",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.canApplyLater).toBe(true);
    const ops = result.result.proposedPatch!.operations;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ op: "updateNodeConfig", nodeId: "n_dm", config: { userId: "user123" } });
    // Deterministic sentinel — proves no model produced this.
    expect(result.result.model.modelId).toBe("deterministic-completion");
    expect(result.result.proposedPatch!.baseRevision).toBe(REVISION);
  });
});

describe("config completion on an existing node", () => {
  it("fills a Slack channel-message field via updateNodeConfig, apply-ready", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([
        gnode("t1", "trigger", "gmail", "new_email", {}),
        gnode("n_msg", "action", "slack", "send_channel_message", { channel: "C_OLD", text: "hi" }),
      ], [{ id: "e1", from: "t1", to: "n_msg" }]),
    );
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null,
      answers: [{ nodeId: "n_msg", field: "channel", value: "C_NEW" }],
      currentGraph: { nodes: [{ id: "n_msg", kind: "action", provider: "slack", type: "send_channel_message" }], edges: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.proposedPatch!.operations[0]).toEqual({
      op: "updateNodeConfig",
      nodeId: "n_msg",
      config: { channel: "C_NEW" },
    });
  });
});

describe("filling config on a node in the pending proposed patch", () => {
  it("writes the answer into the addNode op's config (no extra ops)", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("t1", "trigger", "gmail", "new_email", {})]),
    );
    const proposedPatch: WorkflowPatch = {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "stale",
      summary: "Add Slack DM",
      rationale: "user asked",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_dm",
            kind: "action",
            provider: "slack",
            type: "send_direct_message",
            config: { text: "hi" }, // userId still missing
            position: { x: 0, y: 0 },
          },
        },
      ],
    };
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch,
      answers: [{ nodeId: "n_dm", field: "userId", value: "U123" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ops = result.result.proposedPatch!.operations;
    expect(ops).toHaveLength(1); // wrote into the existing addNode, didn't append
    const addOp = ops[0] as Extract<WorkflowPatch["operations"][number], { op: "addNode" }>;
    expect(addOp.node.config).toEqual({ text: "hi", userId: "U123" });
  });
});

// ─── Slice 4.AI-35F — bare answer → server-side target inference ────────────
describe("bare answer inference (AI-35F)", () => {
  function dmPatch(config: Record<string, unknown>): WorkflowPatch {
    return {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "stale",
      summary: "Add Slack DM",
      rationale: "user asked",
      operations: [
        {
          op: "addNode",
          node: {
            id: "n_dm",
            kind: "action",
            provider: "slack",
            type: "send_direct_message",
            config,
            position: { x: 0, y: 0 },
          },
        },
      ],
    };
  }

  it("maps a bare answer to the UNIQUE missing required text field (live regression)", async () => {
    // Pending Slack DM: userId resolved from "me", message body still empty.
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("t1", "trigger", "gmail", "new_email", {})]),
    );
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: dmPatch({ userId: "U123", text: "" }),
      answers: [{ value: "Hey" }], // BARE — no nodeId/field
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const addOp = result.result.proposedPatch!.operations[0] as Extract<
      WorkflowPatch["operations"][number],
      { op: "addNode" }
    >;
    expect(addOp.node.config).toEqual({ userId: "U123", text: "Hey" });
    expect(result.result.model.modelId).toBe("deterministic-completion");
  });

  it("treats an {{AI_FIELD:...}} placeholder as fillable and replaces it", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("t1", "trigger", "gmail", "new_email", {})]),
    );
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: dmPatch({ userId: "U123", text: "{{AI_FIELD:message}}" }),
      answers: [{ value: "Hey" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const addOp = result.result.proposedPatch!.operations[0] as Extract<
      WorkflowPatch["operations"][number],
      { op: "addNode" }
    >;
    expect(addOp.node.config.text).toBe("Hey");
  });

  it("ambiguous_target when more than one required text field is fillable", async () => {
    // Both userId AND text are missing → two candidate text fields → don't guess.
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: dmPatch({}),
      answers: [{ value: "Hey" }],
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous_target" });
    // Inference happens before the graph lookup — no model, no graph read.
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("no_target_node when no required text field is fillable", async () => {
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: dmPatch({ userId: "U123", text: "already written" }),
      answers: [{ value: "Hey" }],
    });
    expect(result).toEqual({ ok: false, reason: "no_target_node" });
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("ambiguous_target when more than one bare answer is supplied", async () => {
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: dmPatch({ userId: "U123", text: "" }),
      answers: [{ value: "Hey" }, { value: "There" }],
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous_target" });
  });
});

describe("fallback reasons (caller re-plans)", () => {
  it("no_answers when answers is empty", async () => {
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null,
      answers: [],
    });
    expect(result).toEqual({ ok: false, reason: "no_answers" });
  });

  it("no_target_node when the answer maps to neither the patch nor the canvas", async () => {
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null,
      answers: [{ nodeId: "ghost", field: "text", value: "x" }],
      currentGraph: { nodes: [], edges: [] },
    });
    expect(result).toEqual({ ok: false, reason: "no_target_node" });
    expect(mockGetWorkflowGraphForAI).not.toHaveBeenCalled();
  });

  it("workflow_not_found when the graph lookup fails", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "x" });
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null,
      answers: [{ nodeId: "n_dm", field: "userId", value: "user123" }],
      currentGraph: { nodes: [{ id: "n_dm", kind: "action", provider: "slack", type: "send_direct_message" }], edges: [] },
    });
    expect(result).toEqual({ ok: false, reason: "workflow_not_found" });
  });

  it("preview_rejected when the completed patch isn't apply-ready (e.g. a still-missing required field)", async () => {
    // The existing node is MISSING `text` and the answer only fills `userId`,
    // so the merged config is still invalid → preview rejects → fall back.
    mockGetWorkflowGraphForAI.mockResolvedValue(
      graphResult([gnode("n_dm", "action", "slack", "send_direct_message", {})]),
    );
    const result = await completePlanWithRequiredInputs({
      userId: "user-1",
      workflowId: "wf1",
      proposedPatch: null,
      answers: [{ nodeId: "n_dm", field: "userId", value: "user123" }],
      currentGraph: { nodes: [{ id: "n_dm", kind: "action", provider: "slack", type: "send_direct_message" }], edges: [] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["preview_rejected", "preview_unavailable"]).toContain(result.reason);
  });
});
