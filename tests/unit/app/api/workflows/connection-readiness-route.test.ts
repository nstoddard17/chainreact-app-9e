/**
 * @jest-environment node
 *
 * REACT-AGENT-READINESS-1 — POST /api/workflows/[id]/connection-readiness.
 *
 * Business rules under test:
 *   - Unauthenticated callers get 401, and the brain is never invoked.
 *   - A non-member (or missing/deleted workflow) collapses to the standard
 *     WORKFLOW_NOT_FOUND 404 (no existence leak), and the brain is never invoked.
 *   - An authorized member's request delegates to `diagnoseWorkflowConnections`
 *     with the SESSION user as subject and the workflow id, and the optional
 *     client `draftOverride` is forwarded so readiness reflects the reviewed change.
 *   - The brain's already-sanitized DTO is returned verbatim.
 *
 * The connection BRAIN is mocked (its own unit test covers provenance + no-leak
 * derivation); this verifies the route's auth gate, subject identity, override
 * forwarding, and pass-through.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

const mockDiagnose = jest.fn();
jest.mock("@/services/diagnostics/integrationConnection", () => ({
  diagnoseWorkflowConnections: (...a: unknown[]) => mockDiagnose(...a),
}));

import { POST } from "@/app/api/workflows/[id]/connection-readiness/route";

const baseWorkflow = {
  id: "wf-1",
  accountId: "acct-1",
  createdByUserId: "user-1",
  name: "WF",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  folderId: null,
  deletedByUserId: null,
  purgeAfter: null,
  deletedFromFolderId: null,
  deleteOperationId: null,
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

const DRAFT_OVERRIDE = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "gmail", type: "send_email", config: { to: "x" }, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};

const SANITIZED_DTO = {
  workflowId: "wf-1",
  access: "OK",
  allRequiredConnected: false,
  providers: [
    {
      provider: "gmail",
      name: "Gmail",
      credentialClass: "personal",
      nodeIds: ["a1"],
      nodeCount: 1,
      status: "DISCONNECTED",
      ready: false,
      providerEnabled: true,
      refreshable: true,
      tokenExpired: null,
      scopesSatisfied: true,
      missingScopeCount: 0,
      reconnectNeeded: false,
      canReconnect: true,
    },
  ],
};

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/workflows/wf-1/connection-readiness", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "wf-1" });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetById.mockResolvedValue(baseWorkflow);
  mockIsMember.mockResolvedValue(true);
  mockDiagnose.mockResolvedValue(SANITIZED_DTO);
});

describe("POST /api/workflows/[id]/connection-readiness", () => {
  it("rejects an unauthenticated caller with 401 and never calls the brain", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(jsonRequest({}), { params });
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("returns a 404 no-leak for a non-member and never calls the brain", async () => {
    signedInAs("intruder");
    mockIsMember.mockResolvedValue(false);
    const res = await POST(jsonRequest({}), { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("returns a 404 for a missing/deleted workflow", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValue(null);
    const res = await POST(jsonRequest({}), { params });
    expect(res.status).toBe(404);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("delegates to the brain with the session subject + workflow id and returns the DTO verbatim", async () => {
    signedInAs("user-1");
    const res = await POST(jsonRequest({}), { params });
    expect(res.status).toBe(200);
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
    const body = await res.json();
    expect(body).toEqual(SANITIZED_DTO);
  });

  it("forwards the client draftOverride so readiness reflects the reviewed change", async () => {
    signedInAs("user-1");
    await POST(jsonRequest({ draftOverride: DRAFT_OVERRIDE }), { params });
    expect(mockDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectUserId: "user-1",
        workflowId: "wf-1",
        draftOverride: expect.objectContaining({ nodes: expect.any(Array) }),
      }),
    );
  });

  it("rejects a malformed draftOverride with 400 before touching the brain", async () => {
    signedInAs("user-1");
    // edges referencing an unknown node fail WorkflowDefinitionSchema.superRefine.
    const res = await POST(
      jsonRequest({ draftOverride: { nodes: [], edges: [{ id: "e1", from: "x", to: "y" }] } }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });
});
