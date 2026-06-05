/**
 * @jest-environment node
 *
 * CS-3 — per-node credential-owner routes: auth, no-leak, and typed-error
 * mapping. Mocks supabase auth, the workflows repo (getById), accountMemberships
 * (isMember + getRole, used by requireWorkflowAccountMember + requireAccountRole),
 * and the reassignment service. Asserts non-members collapse to 404, the success
 * shape carries no labels/emails/tokens, and reasons map to stable codes.
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
const mockGetRole = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
  getRole: (...a: unknown[]) => mockGetRole(...a),
}));

const mockRequest = jest.fn();
const mockAccept = jest.fn();
const mockRevoke = jest.fn();
jest.mock("@/services/teamCredentials/reassignmentService", () => ({
  requestReassignment: (...a: unknown[]) => mockRequest(...a),
  acceptReassignment: (...a: unknown[]) => mockAccept(...a),
  revokeReassignment: (...a: unknown[]) => mockRevoke(...a),
  declineReassignment: jest.fn(),
}));

import { POST as REQUEST } from "@/app/api/workflows/[id]/nodes/[nodeId]/credential-owner/request/route";
import { POST as ACCEPT } from "@/app/api/workflows/[id]/nodes/[nodeId]/credential-owner/accept/route";
import { POST as REVOKE } from "@/app/api/workflows/[id]/nodes/[nodeId]/credential-owner/revoke/route";

const record = {
  id: "wf-1",
  accountId: "team-1",
  createdByUserId: "creatorA",
  name: "WF",
  state: "active" as const,
  draftDefinition: { nodes: [], edges: [] },
};

function params(id = "wf-1", nodeId = "node-gmail") {
  return { params: Promise.resolve({ id, nodeId }) };
}

function req(body: unknown = {}) {
  return new Request("http://t/", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "ownerX" } }, error: null });
  mockGetById.mockResolvedValue(record);
  mockIsMember.mockResolvedValue(true);
  mockGetRole.mockResolvedValue("owner");
});

describe("request route", () => {
  it("happy path → 200 with only { ok, status } (no labels/emails/tokens)", async () => {
    mockRequest.mockResolvedValue({ ok: true, status: "pending" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, status: "pending" });
    // no leaked fields
    const blob = JSON.stringify(json);
    expect(blob).not.toMatch(/token|email|@|accessToken|label/i);
  });

  it("non-member → 404 WORKFLOW_NOT_FOUND (no existence leak), service not called", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no" } });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(401);
  });

  it("missing/deleted workflow → 404", async () => {
    mockGetById.mockResolvedValue({ ...record, state: "deleted" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(404);
  });

  it("invalid body (no targetUserId) → 400", async () => {
    const res = await REQUEST(req({}), params());
    expect(res.status).toBe(400);
  });

  it("feature_disabled → 404 (flag state is not an existence oracle)", async () => {
    mockRequest.mockResolvedValue({ ok: false, reason: "feature_disabled" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("not_applicable (account/service provider) → 400 NOT_APPLICABLE", async () => {
    mockRequest.mockResolvedValue({ ok: false, reason: "not_applicable" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NOT_APPLICABLE");
  });

  it("target_not_connected → 400 TARGET_NOT_CONNECTED", async () => {
    mockRequest.mockResolvedValue({ ok: false, reason: "target_not_connected" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TARGET_NOT_CONNECTED");
  });

  it("duplicate → 409 DUPLICATE_REASSIGNMENT", async () => {
    mockRequest.mockResolvedValue({ ok: false, reason: "duplicate" });
    const res = await REQUEST(req({ targetUserId: "userB" }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_REASSIGNMENT");
  });
});

describe("accept route", () => {
  it("not_target → 403 NOT_TARGET", async () => {
    mockAccept.mockResolvedValue({ ok: false, reason: "not_target" });
    const res = await ACCEPT(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_TARGET");
  });

  it("happy path → 200 { ok, status: accepted }", async () => {
    mockAccept.mockResolvedValue({ ok: true, status: "accepted" });
    const res = await ACCEPT(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "accepted" });
  });
});

describe("revoke route", () => {
  it("forbidden → 403 FORBIDDEN", async () => {
    mockRevoke.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await REVOKE(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("passes the caller's resolved role to the service", async () => {
    mockGetRole.mockResolvedValue("admin");
    mockRevoke.mockResolvedValue({ ok: true, status: "revoked" });
    await REVOKE(req(), params());
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "ownerX", actingRole: "admin" }),
    );
  });
});
