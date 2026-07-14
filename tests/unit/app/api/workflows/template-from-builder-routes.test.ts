/**
 * @jest-environment node
 *
 * Route tests for the in-builder template endpoints (CS-XT-IN-BUILDER):
 *   POST /api/workflows/[id]/create-from-template
 *   POST /api/workflows/[id]/replace-from-template
 *
 * Mocks supabase auth, the workflow repo + membership (for the shared member gate), and the
 * templateManagement service. Load-bearing checks: auth required; the create target account
 * is inferred SERVER-SIDE from the current workflow (client never names an account); a
 * non-member collapses to 404 (no existence leak); service reasons map to stable HTTP; and
 * NO raw account/user id appears in the replace response.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({ getById: (...a: unknown[]) => mockGetById(...a) }));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({ isMember: (...a: unknown[]) => mockIsMember(...a) }));

const mockCreateFromTemplate = jest.fn();
const mockReplaceWithTemplate = jest.fn();
jest.mock("@/services/workflows/templateManagement", () => ({
  createWorkflowFromTemplate: (...a: unknown[]) => mockCreateFromTemplate(...a),
  replaceWorkflowWithTemplate: (...a: unknown[]) => mockReplaceWithTemplate(...a),
}));

import { POST as createPost } from "@/app/api/workflows/[id]/create-from-template/route";
import { POST as replacePost } from "@/app/api/workflows/[id]/replace-from-template/route";

const WF = "11111111-1111-1111-1111-111111111111";
const WF_ACCOUNT = "22222222-2222-2222-2222-222222222222";
const CALLER = "33333333-3333-3333-3333-333333333333";
const TPL = "44444444-4444-4444-4444-444444444444";

function params() {
  return { params: Promise.resolve({ id: WF }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}
function req(body: unknown) {
  return new Request("https://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function workflowRecord(over: Record<string, unknown> = {}) {
  return {
    id: WF,
    accountId: WF_ACCOUNT,
    createdByUserId: CALLER,
    name: "Current",
    state: "draft",
    draftDefinition: { nodes: [], edges: [] },
    activeRevisionId: null,
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-06-07T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockIsMember.mockReset();
  mockCreateFromTemplate.mockReset();
  mockReplaceWithTemplate.mockReset();
});

describe("POST /api/workflows/[id]/create-from-template", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await createPost(req({ templateId: TPL }), params());
    expect(res.status).toBe(401);
    expect(mockCreateFromTemplate).not.toHaveBeenCalled();
  });

  it("non-member of the current workflow's account → 404 (no create)", async () => {
    signedIn();
    mockGetById.mockResolvedValueOnce(workflowRecord());
    mockIsMember.mockResolvedValueOnce(false);
    const res = await createPost(req({ templateId: TPL }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockCreateFromTemplate).not.toHaveBeenCalled();
  });

  it("creates in the SAME account as the current workflow (inferred server-side) → 201", async () => {
    signedIn();
    mockGetById.mockResolvedValueOnce(workflowRecord());
    mockIsMember.mockResolvedValueOnce(true);
    mockCreateFromTemplate.mockResolvedValueOnce({ ok: true, workflowId: "wf-new", workflowName: "New" });
    const res = await createPost(req({ templateId: TPL }), params());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ workflowId: "wf-new", name: "New" });
    // targetAccountId comes from the workflow record — never from the request body.
    expect(mockCreateFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: TPL, targetAccountId: WF_ACCOUNT, actorUserId: CALLER }),
    );
  });

  it("maps service reasons: template_not_found→404, target_not_member→403, invalid_template→422", async () => {
    for (const [reason, status, code] of [
      ["template_not_found", 404, "TEMPLATE_NOT_FOUND"],
      ["target_not_member", 403, "NOT_ACCOUNT_MEMBER"],
      ["invalid_template", 422, "INVALID_TEMPLATE"],
    ] as const) {
      signedIn();
      mockGetById.mockResolvedValueOnce(workflowRecord());
      mockIsMember.mockResolvedValueOnce(true);
      mockCreateFromTemplate.mockResolvedValueOnce({ ok: false, reason });
      const res = await createPost(req({ templateId: TPL }), params());
      expect(res.status).toBe(status);
      expect((await res.json()).code).toBe(code);
    }
  });
});

describe("POST /api/workflows/[id]/replace-from-template", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(401);
    expect(mockReplaceWithTemplate).not.toHaveBeenCalled();
  });

  it("workflow_not_found → 404 (covers missing + non-member, no leak)", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({ ok: false, reason: "workflow_not_found" });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("invalid_template → 422", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({ ok: false, reason: "invalid_template" });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("INVALID_TEMPLATE");
  });

  it("happy path → 200 WorkflowDetail; NO raw account/user id leaks", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({ ok: true, workflow: workflowRecord() });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Returns the updated workflow detail (so the builder can re-hydrate).
    expect(body).toEqual(expect.objectContaining({ id: WF, draftDefinition: { nodes: [], edges: [] } }));
    // toWorkflowDetail must not surface accountId / createdByUserId.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(WF_ACCOUNT);
    expect(raw).not.toContain(CALLER);
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("createdByUserId");
    // Actor id came from the session, forwarded to the service.
    expect(mockReplaceWithTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: WF, templateId: TPL, actorUserId: CALLER }),
    );
  });

  it("origin 'react_agent' → recordHistory:true forwarded to the service (AI apply-to-current)", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({ ok: true, workflow: workflowRecord() });
    const res = await replacePost(req({ templateId: TPL, origin: "react_agent" }), params());
    expect(res.status).toBe(200);
    expect(mockReplaceWithTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: WF, templateId: TPL, actorUserId: CALLER, recordHistory: true }),
    );
  });

  it("no origin (in-builder modal) → recordHistory is NOT set (keeps the modal's no-checkpoint behavior)", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({ ok: true, workflow: workflowRecord() });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(200);
    expect(mockReplaceWithTemplate).toHaveBeenCalledTimes(1);
    expect(mockReplaceWithTemplate.mock.calls[0]![0]).not.toHaveProperty("recordHistory");
  });

  it("rejects an unknown origin value (strict body)", async () => {
    signedIn();
    const res = await replacePost(req({ templateId: TPL, origin: "hacker" }), params());
    expect(res.status).toBe(400);
    expect(mockReplaceWithTemplate).not.toHaveBeenCalled();
  });

  it("surfaces the disabled state when replacing an active workflow (service deactivated it)", async () => {
    signedIn();
    mockReplaceWithTemplate.mockResolvedValueOnce({
      ok: true,
      workflow: workflowRecord({ state: "disabled", disabledReason: "manual_admin" }),
    });
    const res = await replacePost(req({ templateId: TPL }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    // The builder reads this to reflect that the workflow is no longer active.
    expect(body.state).toBe("disabled");
    expect(body.id).toBe(WF);
    // disabledReason is NOT part of the WorkflowDetail DTO (summary-level only).
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(WF_ACCOUNT);
    expect(raw).not.toContain(CALLER);
  });
});
