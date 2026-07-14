/**
 * @jest-environment node
 *
 * services/workflows/templateManagement → replaceWorkflowWithTemplate (CS-XT-IN-BUILDER /
 * AI-TEMPLATE-APPLY-CURRENT). Mocks the repos, the account role gate (resolveTemplateForAccess), and
 * the CANONICAL save + checkpoint + history services this now composes. Proves:
 *   - membership authorization on the TARGET workflow (missing / deleted / non-member all collapse to
 *     the same `workflow_not_found` — no existence leak);
 *   - template access reuse (inaccessible / missing template → template_not_found);
 *   - definition validation before apply (bad graph → invalid_template);
 *   - the draft is written through the CANONICAL `saveDraftDefinition` path (one lifecycle rule),
 *     never a bespoke disable;
 *   - the TEMPLATE ROW IS NEVER MUTATED and NO usage event is recorded;
 *   - AI origin (`recordHistory`) captures a pre-replace CHECKPOINT (before the write) + records a
 *     History row linked to it; the modal path (no flag) does neither.
 */

const repo = {
  getTemplateByIdAnyAccountServiceRole: jest.fn(),
  // write-side template methods — must NEVER be called by a replace.
  createTemplateServiceRole: jest.fn(),
  updateTemplateMetadataServiceRole: jest.fn(),
  deleteTemplateServiceRole: jest.fn(),
  recordTemplateUsageEventServiceRole: jest.fn(),
};
jest.mock("@/repositories/workflowTemplates", () => repo);

const mockGetWorkflow = jest.fn();
const mockUpdateDraftDefinition = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetWorkflow(...a),
  updateDraftDefinition: (...a: unknown[]) => mockUpdateDraftDefinition(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

// The draft write + active-trigger-change deactivation is the CANONICAL shared rule; mock it so the
// service test asserts DELEGATION (not saveDraftDefinition's own internals, which have their own test).
// The default impl runs the caller's `write()` so the "overwrites the draft" assertion stays meaningful.
const mockSaveDraftDefinition = jest.fn();
jest.mock("@/services/workflows/saveDraftDefinition", () => ({
  saveDraftDefinition: (...a: unknown[]) => mockSaveDraftDefinition(...a),
}));

// Checkpoint + History services are reused verbatim; assert the AI path calls them (and the modal path
// does not).
const mockCreateCheckpoint = jest.fn();
jest.mock("@/services/workflows/checkpoints", () => ({
  createCheckpoint: (...a: unknown[]) => mockCreateCheckpoint(...a),
}));
const mockRecordAgentChange = jest.fn();
jest.mock("@/services/workflows/agentChangeHistory", () => ({
  recordAgentChange: (...a: unknown[]) => mockRecordAgentChange(...a),
}));

import { replaceWorkflowWithTemplate } from "@/services/workflows/templateManagement";

const ACTOR = "user-1";
const WF = "wf-1";
const WF_ACCOUNT = "acct-1";
const TPL = "tpl-1";
const CP_ID = "c0ffee00-0000-4000-8000-0000000000cc";

const VALID_DEF = {
  nodes: [
    { id: "n1", kind: "trigger", provider: "slack", type: "slack:message", position: { x: 0, y: 0 }, config: { channel: "__REDACTED__" } },
  ],
  edges: [],
};

const PRE_DRAFT = { nodes: [], edges: [] };

function workflowRecord(over: Record<string, unknown> = {}) {
  return {
    id: WF,
    accountId: WF_ACCOUNT,
    createdByUserId: ACTOR,
    name: "Current workflow",
    state: "draft",
    draftDefinition: PRE_DRAFT,
    activeRevisionId: null,
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-06-07T00:00:00Z",
    updatedAt: "2026-06-07T00:00:00Z",
    ...over,
  };
}

function templateRecord(over: Record<string, unknown> = {}) {
  return {
    id: TPL,
    accountId: "tpl-acct",
    createdByUserId: "author-9",
    name: "Lead intake",
    description: "desc",
    source: "user",
    visibility: "public", // publicly accessible → no role gate needed
    definition: VALID_DEF,
    schemaVersion: 1,
    publishedAt: "2026-06-01T00:00:00Z",
    unpublishedAt: null,
    forkedFromTemplateId: null,
    creatorDisplayNameSnapshot: "Author",
    usageCount: 0,
    forkCount: 0,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWorkflow.mockResolvedValue(workflowRecord());
  mockIsMember.mockResolvedValue(true);
  repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(templateRecord());
  mockUpdateDraftDefinition.mockImplementation(async (_id: string, def: unknown) =>
    workflowRecord({ draftDefinition: def, updatedAt: "2026-06-08T00:00:00Z" }),
  );
  // Default: delegate to the caller's write (mirrors the real save for a non-trigger-changing edit).
  mockSaveDraftDefinition.mockImplementation(async (input: { write: () => Promise<unknown> }) => input.write());
  mockCreateCheckpoint.mockResolvedValue({ id: CP_ID });
  mockRecordAgentChange.mockResolvedValue({});
});

describe("replaceWorkflowWithTemplate — authorization", () => {
  it("missing / deleted workflow → workflow_not_found (template never resolved)", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "workflow_not_found" });
    expect(repo.getTemplateByIdAnyAccountServiceRole).not.toHaveBeenCalled();
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled();
  });

  it("non-member of the workflow's account → workflow_not_found (no existence leak, no write)", async () => {
    mockIsMember.mockResolvedValue(false);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "workflow_not_found" });
    expect(mockIsMember).toHaveBeenCalledWith(ACTOR, WF_ACCOUNT);
    expect(repo.getTemplateByIdAnyAccountServiceRole).not.toHaveBeenCalled();
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("replaceWorkflowWithTemplate — template resolution + validation", () => {
  it("inaccessible / missing template → template_not_found (no write)", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(null);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "template_not_found" });
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled();
  });

  it("private template + non-member of the OWNING account → template_not_found", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(templateRecord({ visibility: "private", accountId: "tpl-acct" }));
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "template_not_found" });
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled();
  });

  it("template whose graph violates workflow invariants → invalid_template (no write)", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(
      templateRecord({
        definition: {
          nodes: [
            { id: "t1", kind: "trigger", provider: "slack", type: "x", position: { x: 0, y: 0 }, config: {} },
            { id: "t2", kind: "trigger", provider: "slack", type: "y", position: { x: 0, y: 0 }, config: {} },
          ],
          edges: [],
        },
      }),
    );
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "invalid_template" });
    expect(mockSaveDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("replaceWorkflowWithTemplate — canonical save delegation (modal path: no history)", () => {
  it("overwrites ONLY the draft through saveDraftDefinition; template untouched; no checkpoint/history", async () => {
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r.ok).toBe(true);

    // The write goes through the ONE canonical path, with the prior state + before/after definitions.
    expect(mockSaveDraftDefinition).toHaveBeenCalledTimes(1);
    const saveArg = mockSaveDraftDefinition.mock.calls[0]![0]!;
    expect(saveArg.previousState).toBe("draft");
    expect(saveArg.previousDefinition).toEqual(PRE_DRAFT);
    expect(JSON.stringify(saveArg.nextDefinition)).toContain("__REDACTED__"); // sanitized markers travel

    // saveDraftDefinition ran the caller's write against the CURRENT workflow only.
    expect(mockUpdateDraftDefinition).toHaveBeenCalledTimes(1);
    expect(mockUpdateDraftDefinition.mock.calls[0]![0]).toBe(WF);

    // Modal path (no recordHistory) — no restore point, no History row.
    expect(mockCreateCheckpoint).not.toHaveBeenCalled();
    expect(mockRecordAgentChange).not.toHaveBeenCalled();

    // The TEMPLATE ROW is never mutated, and no usage event is recorded.
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
    expect(repo.updateTemplateMetadataServiceRole).not.toHaveBeenCalled();
    expect(repo.deleteTemplateServiceRole).not.toHaveBeenCalled();
    expect(repo.recordTemplateUsageEventServiceRole).not.toHaveBeenCalled();
  });

  it("passes the previous state to saveDraftDefinition (active → its rule decides deactivation)", async () => {
    mockGetWorkflow.mockResolvedValue(workflowRecord({ state: "active" }));
    // Simulate saveDraftDefinition deactivating an active workflow whose trigger changed.
    mockSaveDraftDefinition.mockResolvedValue(
      workflowRecord({ state: "disabled", disabledReason: "manual_admin" }),
    );
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r.ok).toBe(true);
    expect(mockSaveDraftDefinition.mock.calls[0]![0]!.previousState).toBe("active");
    // The service returns whatever the canonical path resolved (disabled here) — no bespoke disable.
    expect(r.ok && r.workflow.state).toBe("disabled");
    expect(r.ok && r.workflow.id).toBe(WF);
    expect(r.ok && r.workflow.name).toBe("Current workflow");
  });
});

describe("replaceWorkflowWithTemplate — AI origin (recordHistory) checkpoint + History", () => {
  it("captures a pre-replace checkpoint BEFORE the write, then records preview_created → preview_applied linked to it", async () => {
    const callOrder: string[] = [];
    mockCreateCheckpoint.mockImplementation(async () => {
      callOrder.push("checkpoint");
      return { id: CP_ID };
    });
    mockSaveDraftDefinition.mockImplementation(async (input: { write: () => Promise<unknown> }) => {
      callOrder.push("save");
      return input.write();
    });

    const r = await replaceWorkflowWithTemplate({
      workflowId: WF,
      templateId: TPL,
      actorUserId: ACTOR,
      recordHistory: true,
    });
    expect(r.ok).toBe(true);

    // Checkpoint captured the PRE-replace draft, before the mutation.
    expect(mockCreateCheckpoint).toHaveBeenCalledTimes(1);
    const cpArg = mockCreateCheckpoint.mock.calls[0]![0]!;
    expect(cpArg).toEqual(
      expect.objectContaining({
        workflowId: WF,
        accountId: WF_ACCOUNT,
        createdByUserId: ACTOR,
        source: "react_agent",
        definition: PRE_DRAFT,
      }),
    );
    expect(callOrder).toEqual(["checkpoint", "save"]);

    // Two History records: a create then a transition to applied, sharing one agent_change_id, the
    // applied row linked to the checkpoint (→ "Restore").
    expect(mockRecordAgentChange).toHaveBeenCalledTimes(2);
    const first = mockRecordAgentChange.mock.calls[0]![0]!.request;
    const second = mockRecordAgentChange.mock.calls[1]![0]!.request;
    expect(first.status).toBe("preview_created");
    expect(second.status).toBe("preview_applied");
    expect(first.agentChangeId).toBe(second.agentChangeId);
    expect(second.checkpointId).toBe(CP_ID);
    // History is account-scoped to the workflow's account.
    expect(mockRecordAgentChange.mock.calls[0]![0]!.accountId).toBe(WF_ACCOUNT);
  });

  it("fail-open: a checkpoint failure does not block the apply (History row still recorded, un-linked)", async () => {
    mockCreateCheckpoint.mockRejectedValue(new Error("db down"));
    const r = await replaceWorkflowWithTemplate({
      workflowId: WF,
      templateId: TPL,
      actorUserId: ACTOR,
      recordHistory: true,
    });
    expect(r.ok).toBe(true);
    expect(mockSaveDraftDefinition).toHaveBeenCalledTimes(1); // apply still landed
    const applied = mockRecordAgentChange.mock.calls.find((c) => c[0]!.request.status === "preview_applied");
    expect(applied?.[0]!.request.checkpointId).toBeUndefined(); // no restore point to link
  });

  it("fail-open: a History write failure does not fail the apply", async () => {
    mockRecordAgentChange.mockRejectedValue(new Error("db down"));
    const r = await replaceWorkflowWithTemplate({
      workflowId: WF,
      templateId: TPL,
      actorUserId: ACTOR,
      recordHistory: true,
    });
    expect(r.ok).toBe(true);
    expect(mockSaveDraftDefinition).toHaveBeenCalledTimes(1);
  });
});
