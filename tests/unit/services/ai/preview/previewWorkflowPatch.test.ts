/**
 * @jest-environment node
 *
 * Tests for services/ai/preview/previewWorkflowPatch.ts (Slice 4.AI-5).
 *
 * Mocks only getWorkflowGraphForAI (current def + ownership) and userBilling
 * (no-deduction guard). The AI-3 validator, the discovery registry, the COST-2
 * estimator, and the AI-4 explainer all run for real — so the preview is
 * exercised end-to-end and stays grounded in live metadata (no hardcoding).
 */
const mockGetWorkflowGraphForAI = jest.fn();
const mockDeductTasks = jest.fn();

jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetWorkflowGraphForAI(...a),
}));
jest.mock("@/repositories/accountBilling", () => ({
  deductTasks: (...a: unknown[]) => mockDeductTasks(...a),
  getUsage: jest.fn(),
}));

import { previewWorkflowPatchForAI } from "@/services/ai/preview/previewWorkflowPatch";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (code: string, message: string) => ({ ok: false as const, code, message });

function gnode(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function graph(
  nodes: ReturnType<typeof gnode>[],
  edges: { id: string; from: string; to: string; label?: string }[],
  name = "WF",
) {
  return ok({
    workflowId: "wf1",
    name,
    state: "draft",
    activeRevisionId: null,
    updatedAt: "2026-05-25T00:00:00Z",
    nodes,
    edges,
  });
}

function patch(operations: PatchOperation[], extra: Partial<WorkflowPatch> = {}): WorkflowPatch {
  return {
    patchId: "p1",
    workflowId: "wf1",
    baseRevision: "rev-1",
    operations,
    summary: "Do thing",
    rationale: "r",
    ...extra,
  };
}

// Base saved workflow: gmail trigger → gmail send_email action.
const baseGraph = () =>
  graph(
    [gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", { to: "x@y.com" })],
    [{ id: "e1", from: "t", to: "a1" }],
  );

beforeEach(() => {
  mockGetWorkflowGraphForAI.mockReset();
  mockDeductTasks.mockReset();
  mockGetWorkflowGraphForAI.mockResolvedValue(baseGraph());
});

const PREVIEW_INPUT = { userId: "owner-1", workflowId: "wf1" };

describe("previewWorkflowPatchForAI — ownership / loading", () => {
  it("returns NOT_FOUND when the workflow can't be loaded (missing/not owned)", async () => {
    mockGetWorkflowGraphForAI.mockResolvedValue(err("NOT_FOUND", "No workflow 'wf1'."));
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
  });

  it("previews a valid low-risk patch with before/after summaries", async () => {
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 9, y: 9 } }]) });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(true);
    expect(res.data.canApplyLater).toBe(true);
    expect(res.data.beforeSummary).toBeDefined();
    expect(res.data.afterSummary).toBeDefined();
    expect(res.data.candidateSummary).toContain("node(s)");
    // Revision token surfaced so callers can set patch.baseRevision for AI-6.
    expect(res.data.currentRevision).toBe("2026-05-25T00:00:00Z");
  });
});

describe("previewWorkflowPatchForAI — valid patch change summaries", () => {
  it("addNode + addEdge produce add/connect change descriptions", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([
        { op: "addNode", node: gnode("a2", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "a2" } },
      ]),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(true);
    const ops = res.data.changes.map((c) => c.op);
    expect(ops).toEqual(["addNode", "addEdge"]);
    expect(res.data.changes[0]!.description).toMatch(/^Adds /);
    expect(res.data.changes[1]!.description).toMatch(/^Connects /);
    // The preview validates the patch with the model's proposed ids intact
    // (id materialization happens at apply, not preview — see the service doc).
    expect(res.data.affectedEdgeIds).toContain("e2");
  });

  it("updateNodeConfig lists field KEY names but never values", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "new@secret.com", subject: "Hi there" } }]),
    });
    if (!res.ok) throw new Error("expected ok");
    const change = res.data.changes.find((c) => c.op === "updateNodeConfig")!;
    expect(change.fields).toEqual(["to", "subject"]);
    expect(JSON.stringify(res.data)).not.toContain("new@secret.com");
    expect(JSON.stringify(res.data)).not.toContain("Hi there");
  });

  it("removeNode, removeEdge, replaceEdge, replaceTrigger, repairVariableReference describe deterministically", async () => {
    const removeNode = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "removeNode", nodeId: "a1" }]) });
    expect(removeNode.ok && removeNode.data.changes[0]!.description).toMatch(/^Removes /);

    const removeEdge = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "removeEdge", edgeId: "e1" }]) });
    expect(removeEdge.ok && removeEdge.data.changes[0]!.description).toMatch(/^Removes /);

    const replaceTrigger = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "replaceTrigger", node: gnode("t2", "trigger", "native", "manual.run") }]) });
    expect(replaceTrigger.ok && replaceTrigger.data.changes[0]!.description).toMatch(/^Replaces workflow trigger/);

    const repair = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "repairVariableReference", nodeId: "a1", fieldPath: "subject", newReference: "{{trigger.from}}" }]) });
    expect(repair.ok && repair.data.changes[0]!.description).toMatch(/Repairs variable reference in field "subject"/);
  });
});

describe("previewWorkflowPatchForAI — invalid patches", () => {
  async function previewOps(operations: PatchOperation[], baseGraphOverride?: ReturnType<typeof graph>) {
    if (baseGraphOverride) mockGetWorkflowGraphForAI.mockResolvedValue(baseGraphOverride);
    return previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch(operations) });
  }

  it("unknown action → ok:false, canApplyLater:false, no afterSummary", async () => {
    const res = await previewOps([{ op: "addNode", node: gnode("a2", "action", "acme", "do_thing") }]);
    if (!res.ok) throw new Error("expected envelope ok");
    expect(res.data.ok).toBe(false);
    expect(res.data.canApplyLater).toBe(false);
    expect(res.data.afterSummary).toBeUndefined();
    expect(res.data.candidateSummary).toBeUndefined();
    // The error CODE is preserved for dev identification...
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(true);
    // ...but the user-facing blockedReason + message are friendly (Slice
    // 4.PROVIDER-CATALOG-INTEGRITY-1): no raw key, no "registered", no "V2".
    expect(res.data.blockedReason).toMatch(/isn't available as an action yet/i);
    expect(res.data.blockedReason).not.toMatch(/V2|registered|acme:do_thing/);
    expect(res.data.validation.errors[0]!.message).not.toMatch(/V2|registered|acme:do_thing/);
    // currentRevision is present even when the patch is invalid (workflow loaded).
    expect(res.data.currentRevision).toBe("2026-05-25T00:00:00Z");
  });

  it("unknown trigger → ok:false", async () => {
    const res = await previewOps([{ op: "replaceTrigger", node: gnode("t2", "trigger", "acme", "on_thing") }]);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "UNKNOWN_TRIGGER")).toBe(true);
    expect(res.ok && res.data.ok).toBe(false);
  });

  it("missing required field → ok:false (INVALID config family)", async () => {
    const res = await previewOps([{ op: "addNode", node: gnode("a2", "action", "gmail", "send_email", { subject: "Hi" }) }]);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "MISSING_REQUIRED_FIELD")).toBe(true);
    expect(res.ok && res.data.ok).toBe(false);
  });

  it("AI-REPAIR-2D — blocked missing-Slack-message preview uses field + node display labels, never internal keys", async () => {
    // Slack send_channel_message with `channel` set but `text` (the message
    // body) missing → a single MISSING_REQUIRED_FIELD. The user-facing copy
    // must read the FieldMeta label ("Message") + node display label ("Send
    // Channel Message"), never the field key `text` or the `provider:type` key.
    const res = await previewOps([
      { op: "addNode", node: gnode("a2", "action", "slack", "send_channel_message", { channel: "C12345678" }) },
    ]);
    if (!res.ok) throw new Error("expected envelope ok");
    expect(res.data.ok).toBe(false);
    expect(res.data.validation.errors.some((e) => e.code === "MISSING_REQUIRED_FIELD")).toBe(true);

    // The error CODE / dev path is still preserved for diagnostics…
    const missing = res.data.validation.errors.find((e) => e.code === "MISSING_REQUIRED_FIELD")!;
    expect(missing.message).toBe("Required field “Message” is missing on “Send Channel Message.”");

    // …but the user-facing blockedReason + message use friendly labels only.
    expect(res.data.blockedReason).toBe("Required field “Message” is missing on “Send Channel Message.”");
    expect(res.data.blockedReason).toMatch(/Message/);
    expect(res.data.blockedReason).toMatch(/Send Channel Message/);

    // No internal leakage anywhere in the blocked surface.
    expect(res.data.blockedReason).not.toMatch(/'text'|slacksend_channel_message|slack:send_channel_message/);
    expect(missing.message).not.toMatch(/'text'|slacksend_channel_message|slack:send_channel_message/);
    // The proposed node id (`a2`) must never reach user-facing copy.
    expect(res.data.blockedReason).not.toMatch(/\ba2\b/);
    expect(missing.message).not.toMatch(/\ba2\b/);
  });

  it("edge to a missing node → INVALID_EDGE", async () => {
    const res = await previewOps([{ op: "addEdge", edge: { id: "e9", from: "a1", to: "ghost" } }]);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "INVALID_EDGE")).toBe(true);
  });

  it("downstream variable reference → DOWNSTREAM_VARIABLE_REFERENCE", async () => {
    const g = graph(
      [gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", { to: "x" }), gnode("a2", "action", "gmail", "create_draft", {})],
      [{ id: "e1", from: "t", to: "a1" }, { id: "e2", from: "a1", to: "a2" }],
    );
    const res = await previewOps([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "x@y.com", subject: "{{a2.id}}" } }], g);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "DOWNSTREAM_VARIABLE_REFERENCE")).toBe(true);
  });

  it("duplicate node id → DUPLICATE_NODE_ID", async () => {
    const res = await previewOps([{ op: "addNode", node: gnode("a1", "action", "gmail", "create_draft", {}) }]);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "DUPLICATE_NODE_ID")).toBe(true);
  });

  it("multiple triggers → MULTIPLE_TRIGGERS", async () => {
    const res = await previewOps([{ op: "addNode", node: gnode("t2", "trigger", "native", "manual.run") }]);
    expect(res.ok && res.data.validation.errors.some((e) => e.code === "MULTIPLE_TRIGGERS")).toBe(true);
  });
});

describe("previewWorkflowPatchForAI — Slice 4.PROVIDER-CATALOG-INTEGRITY-1 (self-qualified key + friendly copy)", () => {
  beforeEach(() => {
    mockGetWorkflowGraphForAI.mockResolvedValue(baseGraph());
  });

  it("normalizes a self-qualified replaceTrigger so the supported gmail:new_email trigger resolves (no UNKNOWN_TRIGGER)", async () => {
    // The planner put the combined key in `type` — pre-fix this produced
    // `gmail:gmail:new_email` → UNKNOWN_TRIGGER. Normalization strips the prefix.
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "replaceTrigger", node: gnode("t2", "trigger", "gmail", "gmail:new_email") }]),
    });
    if (!res.ok) throw new Error("expected envelope ok");
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_TRIGGER")).toBe(false);
  });

  it("a genuinely unknown trigger yields friendly blockedReason (no raw key / 'registered' / 'V2')", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "replaceTrigger", node: gnode("t2", "trigger", "gmail", "definitely_not_a_trigger") }]),
    });
    if (!res.ok) throw new Error("expected envelope ok");
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_TRIGGER")).toBe(true);
    expect(res.data.blockedReason).toMatch(/isn't available as a trigger yet/i);
    expect(res.data.blockedReason).not.toMatch(/V2|registered|gmail:definitely_not_a_trigger/);
  });
});

describe("previewWorkflowPatchForAI — risk / confirmation", () => {
  it("adding a destructive/high-risk action requires confirmation", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([
        { op: "addNode", node: gnode("r", "action", "stripe", "create_refund", { chargeId: "ch_1" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "r" } },
      ]),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.riskLevel).toBe("high");
    expect(res.data.requiresConfirmation).toBe(true);
    expect(res.data.riskReasons.length).toBeGreaterThan(0);
    expect(res.data.userFacingSummaryText).toContain("confirmation required");
  });

  it("node removal surfaces risk + confirmation", async () => {
    const g = graph(
      [gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", { to: "x" }), gnode("a2", "action", "gmail", "create_draft", {})],
      [{ id: "e1", from: "t", to: "a1" }, { id: "e2", from: "a1", to: "a2" }],
    );
    mockGetWorkflowGraphForAI.mockResolvedValue(g);
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "removeNode", nodeId: "a1" }]) });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.requiresConfirmation).toBe(true);
    expect(res.data.validation.warnings.some((w) => w.code === "DELETES_USER_WORK")).toBe(true);
  });

  it("model-provided low risk cannot downgrade deterministic high risk", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "addNode", node: gnode("r", "action", "stripe", "create_refund", { chargeId: "ch_1" }) }], { riskLevel: "low", requiresConfirmation: false }),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.riskLevel).toBe("high");
    expect(res.data.requiresConfirmation).toBe(true);
  });
});

describe("previewWorkflowPatchForAI — task cost", () => {
  it("includes the COST-2 estimate and never deducts", async () => {
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.taskCostEstimate).toBeDefined();
    expect(res.data.taskCostEstimate!.policyVersion).toBeTruthy();
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("adding a provider action increases estimated tasks; native control-flow does not", async () => {
    const emptyish = graph([gnode("t", "trigger", "native", "manual.run")], []);
    mockGetWorkflowGraphForAI.mockResolvedValue(emptyish);
    const addAction = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "addNode", node: gnode("a1", "action", "gmail", "send_email", { to: "x@y.com" }) }]) });
    expect(addAction.ok && addAction.data.taskCostEstimate!.estimatedTasksPerRun).toBe(1);

    mockGetWorkflowGraphForAI.mockResolvedValue(baseGraph());
    const addRouter = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "addNode", node: gnode("rt", "action", "native", "router", { routes: [] }) }, { op: "addEdge", edge: { id: "e2", from: "a1", to: "rt" } }]) });
    expect(addRouter.ok && addRouter.data.taskCostEstimate!.estimatedTasksPerRun).toBe(1); // unchanged: a1 only
  });

  it("native:http_request adds cost", async () => {
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "addNode", node: gnode("h", "action", "native", "http_request", { url: "https://x", method: "GET" }) }, { op: "addEdge", edge: { id: "e2", from: "a1", to: "h" } }]) });
    expect(res.ok && res.data.taskCostEstimate!.estimatedTasksPerRun).toBe(2); // a1 + http_request
  });
});

describe("previewWorkflowPatchForAI — no leak", () => {
  it("never surfaces secret values OR secret-shaped config key names", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([
        {
          op: "updateNodeConfig",
          nodeId: "a1",
          config: {
            to: "victim@example.com",
            subject: "private message body",
            accessToken: "ACCESS-aaa",
            Authorization: "Bearer SECRET-ggg",
          },
        },
      ]),
    });
    if (!res.ok) throw new Error("expected ok");
    const serialized = JSON.stringify(res.data);
    // Secret VALUES + PII values never appear.
    for (const v of ["victim@example.com", "private message body", "ACCESS-aaa", "Bearer SECRET-ggg"]) {
      expect(serialized).not.toContain(v);
    }
    // Secret-shaped KEY names are scrubbed too.
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("Authorization");
    // The change summary still lists the non-secret field keys.
    const change = res.data.changes.find((c) => c.op === "updateNodeConfig")!;
    expect(change.fields).toEqual(["to", "subject"]);
    expect(change.description).toContain("sensitive field");
  });
});

describe("previewWorkflowPatchForAI — registry grounding (no provider hardcoding)", () => {
  it("rejects a provider absent from the live metadata registry", async () => {
    // 'pendingprovider' is not registered → must be rejected via grounding, not invented.
    const res = await previewWorkflowPatchForAI({ ...PREVIEW_INPUT, patch: patch([{ op: "addNode", node: gnode("p", "action", "pendingprovider", "do_x") }]) });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(false);
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(true);
  });
});

// ── AI-REPAIR-2b: validate against the unsaved current-draft snapshot ──
//
// The saved graph (`baseGraph`) is trigger `t` → action `a1`. A supplied
// `draftDefinition` becomes the validation target so the preview matches the
// unsaved canvas the user sees — never stale saved state. Authz + name + revision
// still come from the saved load. The draft is read-only (redacted, never written).
describe("previewWorkflowPatchForAI — current-draft override (trust rule)", () => {
  // Draft = saved + an extra slack action `a2`.
  const draftWithExtraNode = () => ({
    nodes: [
      gnode("t", "trigger", "gmail", "new_email"),
      gnode("a1", "action", "gmail", "send_email", { to: "x@y.com" }),
      gnode("a2", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" }),
    ],
    edges: [
      { id: "e1", from: "t", to: "a1" },
      { id: "e2", from: "a1", to: "a2" },
    ],
  });
  // Draft = saved MINUS `a1` (user deleted it locally without saving).
  const draftWithoutA1 = () => ({
    nodes: [gnode("t", "trigger", "gmail", "new_email")],
    edges: [],
  });

  it("a patch targeting a node only in the DRAFT (not saved) previews successfully", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a2", position: { x: 5, y: 5 } }]),
      draftDefinition: draftWithExtraNode(),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(true);
    expect(res.data.affectedNodeIds).toContain("a2");
  });

  it("the SAME patch is rejected without the draft (a2 is not in the saved definition)", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a2", position: { x: 5, y: 5 } }]),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(false);
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_NODE")).toBe(true);
  });

  it("a patch targeting a node REMOVED from the draft is rejected, even though it exists in saved state", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 5, y: 5 } }]),
      draftDefinition: draftWithoutA1(),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(false);
    expect(res.data.validation.errors.some((e) => e.code === "UNKNOWN_NODE")).toBe(true);
  });

  it("falls back to the saved definition when no draft is supplied (a1 exists in saved → valid)", async () => {
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 5, y: 5 } }]),
    });
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.ok).toBe(true);
  });

  it("authz, name + revision still come from the SAVED load; the draft input is not mutated/persisted", async () => {
    const draft = draftWithExtraNode();
    const snapshot = JSON.parse(JSON.stringify(draft));
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a2", position: { x: 5, y: 5 } }]),
      draftDefinition: draft,
    });
    if (!res.ok) throw new Error("expected ok");
    // Revision token is the SAVED workflow's updatedAt — never the client draft's.
    expect(res.data.currentRevision).toBe("2026-05-25T00:00:00Z");
    // The saved graph load (ownership) ran exactly once; nothing was written.
    expect(mockGetWorkflowGraphForAI).toHaveBeenCalledTimes(1);
    expect(mockDeductTasks).not.toHaveBeenCalled();
    // The draft object the caller passed is untouched (redactSecrets clones).
    expect(draft).toEqual(snapshot);
  });

  it("redacts secret-shaped config VALUES in the draft — no secret reaches the result", async () => {
    const draft = {
      nodes: [
        gnode("t", "trigger", "gmail", "new_email"),
        gnode("a1", "action", "gmail", "send_email", { to: "x@y.com", apiKey: "SECRET-DRAFT-VALUE" }),
      ],
      edges: [{ id: "e1", from: "t", to: "a1" }],
    };
    const res = await previewWorkflowPatchForAI({
      ...PREVIEW_INPUT,
      patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]),
      draftDefinition: draft,
    });
    expect(JSON.stringify(res)).not.toContain("SECRET-DRAFT-VALUE");
  });
});
