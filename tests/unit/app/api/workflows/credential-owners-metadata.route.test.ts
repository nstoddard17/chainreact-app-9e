/**
 * @jest-environment node
 *
 * CS-4b — credential-owner metadata + eligible-targets routes: auth, no-leak, and
 * typed mapping. Mocks supabase auth, the workflows repo, accountMemberships
 * (isMember + getRole), and the metadata service. Non-members collapse to 404;
 * responses carry display names only (no email/label/token).
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

const mockBuildMetadata = jest.fn();
const mockListEligible = jest.fn();
jest.mock("@/services/teamCredentials/credentialOwnerMetadata", () => ({
  buildNodeCredentialOwnerMetadata: (...a: unknown[]) => mockBuildMetadata(...a),
  listEligibleReassignmentTargets: (...a: unknown[]) => mockListEligible(...a),
}));

import { GET as METADATA } from "@/app/api/workflows/[id]/credential-owners/route";
import { GET as ELIGIBLE } from "@/app/api/workflows/[id]/nodes/[nodeId]/credential-owner/eligible-targets/route";

const record = { id: "wf-1", accountId: "team-1", createdByUserId: "creatorA", state: "active", draftDefinition: { nodes: [], edges: [] } };

function metaParams() {
  return { params: Promise.resolve({ id: "wf-1" }) };
}
function eligibleParams() {
  return { params: Promise.resolve({ id: "wf-1", nodeId: "node-gmail" }) };
}
const req = new Request("http://t/");

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "ownerX" } }, error: null });
  mockGetById.mockResolvedValue(record);
  mockIsMember.mockResolvedValue(true);
  mockGetRole.mockResolvedValue("owner");
});

describe("GET credential-owners (metadata)", () => {
  it("a member loads safe metadata (display names only, no email/token)", async () => {
    mockBuildMetadata.mockResolvedValue({
      ok: true,
      metadata: {
        workflowId: "wf-1",
        canManage: true,
        nodes: [{ nodeId: "node-gmail", provider: "gmail", status: "accepted", ownerDisplayName: "Dana Reyes" }],
      },
    });
    const res = await METADATA(req, metaParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes[0].ownerDisplayName).toBe("Dana Reyes");
    expect(JSON.stringify(body)).not.toMatch(/@|token|accessToken|label/i);
  });

  it("non-member → 404 (no leak), service not called", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await METADATA(req, metaParams());
    expect(res.status).toBe(404);
    expect(mockBuildMetadata).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no" } });
    const res = await METADATA(req, metaParams());
    expect(res.status).toBe(401);
  });

  it("service workflow_not_found → 404", async () => {
    mockBuildMetadata.mockResolvedValue({ ok: false, reason: "workflow_not_found" });
    const res = await METADATA(req, metaParams());
    expect(res.status).toBe(404);
  });

  it("passes through a flag-off empty state (canManage false, no nodes)", async () => {
    mockBuildMetadata.mockResolvedValue({
      ok: true,
      metadata: { workflowId: "wf-1", canManage: false, nodes: [] },
    });
    const res = await METADATA(req, metaParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ workflowId: "wf-1", canManage: false, nodes: [] });
  });
});

describe("GET eligible-targets", () => {
  it("a manager loads eligible members (display name + role only)", async () => {
    mockListEligible.mockResolvedValue({
      ok: true,
      members: [{ userId: "userB", displayName: "Dana Reyes", role: "member" }],
    });
    const res = await ELIGIBLE(req, eligibleParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toEqual([{ userId: "userB", displayName: "Dana Reyes", role: "member" }]);
    expect(JSON.stringify(body)).not.toMatch(/@|token|scope|label/i);
  });

  it("forbidden (plain member) → 403", async () => {
    mockListEligible.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await ELIGIBLE(req, eligibleParams());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("not_applicable (account provider) → 400", async () => {
    mockListEligible.mockResolvedValue({ ok: false, reason: "not_applicable" });
    const res = await ELIGIBLE(req, eligibleParams());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NOT_APPLICABLE");
  });

  it("feature_disabled → 404 (no existence oracle)", async () => {
    mockListEligible.mockResolvedValue({ ok: false, reason: "feature_disabled" });
    const res = await ELIGIBLE(req, eligibleParams());
    expect(res.status).toBe(404);
  });

  it("non-member → 404, service not called", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await ELIGIBLE(req, eligibleParams());
    expect(res.status).toBe(404);
    expect(mockListEligible).not.toHaveBeenCalled();
  });
});
