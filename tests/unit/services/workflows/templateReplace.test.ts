/**
 * @jest-environment node
 *
 * services/workflows/templateManagement → replaceWorkflowWithTemplate (CS-XT-IN-BUILDER).
 * Mocks the repos + the account role gate (used by resolveTemplateForAccess). Proves:
 *   - membership authorization on the TARGET workflow (missing / deleted / non-member all
 *     collapse to the same `workflow_not_found` — no existence leak);
 *   - template access reuse (inaccessible / missing template → template_not_found);
 *   - definition validation before apply (bad graph → invalid_template);
 *   - happy path overwrites ONLY the draft definition with the validated graph;
 *   - the TEMPLATE ROW IS NEVER MUTATED and NO usage event is recorded.
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

import { replaceWorkflowWithTemplate } from "@/services/workflows/templateManagement";

const ACTOR = "user-1";
const WF = "wf-1";
const WF_ACCOUNT = "acct-1";
const TPL = "tpl-1";

const VALID_DEF = {
  nodes: [
    { id: "n1", kind: "trigger", provider: "slack", type: "slack:message", position: { x: 0, y: 0 }, config: { channel: "__REDACTED__" } },
  ],
  edges: [],
};

function workflowRecord(over: Record<string, unknown> = {}) {
  return {
    id: WF,
    accountId: WF_ACCOUNT,
    createdByUserId: ACTOR,
    name: "Current workflow",
    state: "draft",
    draftDefinition: { nodes: [], edges: [] },
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
});

describe("replaceWorkflowWithTemplate — authorization", () => {
  it("missing / deleted workflow → workflow_not_found (template never resolved)", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "workflow_not_found" });
    expect(repo.getTemplateByIdAnyAccountServiceRole).not.toHaveBeenCalled();
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("non-member of the workflow's account → workflow_not_found (no existence leak, no write)", async () => {
    mockIsMember.mockResolvedValue(false);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "workflow_not_found" });
    expect(mockIsMember).toHaveBeenCalledWith(ACTOR, WF_ACCOUNT);
    expect(repo.getTemplateByIdAnyAccountServiceRole).not.toHaveBeenCalled();
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("replaceWorkflowWithTemplate — template resolution + validation", () => {
  it("inaccessible / missing template → template_not_found (no write)", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(null);
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "template_not_found" });
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("private template + non-member of the OWNING account → template_not_found", async () => {
    repo.getTemplateByIdAnyAccountServiceRole.mockResolvedValue(templateRecord({ visibility: "private", accountId: "tpl-acct" }));
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r).toEqual({ ok: false, reason: "template_not_found" });
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
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
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("replaceWorkflowWithTemplate — happy path", () => {
  it("overwrites ONLY the draft definition with the validated graph; template untouched", async () => {
    const r = await replaceWorkflowWithTemplate({ workflowId: WF, templateId: TPL, actorUserId: ACTOR });
    expect(r.ok).toBe(true);

    // Wrote the validated definition to the CURRENT workflow only.
    expect(mockUpdateDraftDefinition).toHaveBeenCalledTimes(1);
    const [calledWorkflowId, calledDef] = mockUpdateDraftDefinition.mock.calls[0]!;
    expect(calledWorkflowId).toBe(WF);
    expect(JSON.stringify(calledDef)).toContain("__REDACTED__"); // sanitized markers travel

    // The TEMPLATE ROW is never mutated, and no usage event is recorded.
    expect(repo.createTemplateServiceRole).not.toHaveBeenCalled();
    expect(repo.updateTemplateMetadataServiceRole).not.toHaveBeenCalled();
    expect(repo.deleteTemplateServiceRole).not.toHaveBeenCalled();
    expect(repo.recordTemplateUsageEventServiceRole).not.toHaveBeenCalled();
  });
});
