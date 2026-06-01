/**
 * @jest-environment node
 *
 * Route tests for /api/accounts/[id]/members (GET) and
 * /api/accounts/[id]/members/[userId] (DELETE, PATCH) — 4.ACCOUNT-MODEL-16.
 * Mocks auth + requireAccountRole + the membership service.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockListMembers = jest.fn();
const mockRemoveMember = jest.fn();
const mockChangeRole = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  listMembers: (...a: unknown[]) => mockListMembers(...a),
  removeMember: (...a: unknown[]) => mockRemoveMember(...a),
  changeMemberRole: (...a: unknown[]) => mockChangeRole(...a),
}));

import { GET } from "@/app/api/accounts/[id]/members/route";
import { DELETE, PATCH } from "@/app/api/accounts/[id]/members/[userId]/route";

const CALLER = "owner-1";
const ACCOUNT = "team-1";
const TARGET = "user-2";

function params(extra: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: ACCOUNT, ...extra }),
  } as { params: Promise<{ id: string; userId: string }> };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}
function asRole(role: string) {
  signedIn();
  mockRequireRole.mockResolvedValueOnce({ ok: true, role });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockListMembers.mockReset();
  mockRemoveMember.mockReset();
  mockChangeRole.mockReset();
});

describe("GET /api/accounts/[id]/members", () => {
  it("401s unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request("https://x"), params());
    expect(res.status).toBe(401);
  });

  it("403s a non-member (NOT_ACCOUNT_MEMBER)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await GET(new Request("https://x"), params());
    expect(res.status).toBe(403);
    expect(mockListMembers).not.toHaveBeenCalled();
  });

  it("allows ANY member to list (owner/admin/member)", async () => {
    asRole("member");
    mockListMembers.mockResolvedValueOnce([
      { userId: "a", role: "owner", joinedAt: "t", invitedByUserId: null },
    ]);
    const res = await GET(new Request("https://x"), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith(CALLER, ACCOUNT, ["owner", "admin", "member"]);
    const body = await res.json();
    expect(body.members).toHaveLength(1);
  });
});

describe("DELETE /api/accounts/[id]/members/[userId]", () => {
  it("403s a member (only owner/admin)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await DELETE(new Request("https://x", { method: "DELETE" }), params({ userId: TARGET }));
    expect(res.status).toBe(403);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("removes a member and threads the caller's role to the service", async () => {
    asRole("admin");
    mockRemoveMember.mockResolvedValueOnce({ ok: true });
    const res = await DELETE(new Request("https://x", { method: "DELETE" }), params({ userId: TARGET }));
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith(CALLER, ACCOUNT, ["owner", "admin"]);
    expect(mockRemoveMember).toHaveBeenCalledWith({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "admin" });
  });

  it("403 OWNER_TARGET when removing the owner", async () => {
    asRole("owner");
    mockRemoveMember.mockResolvedValueOnce({ ok: false, reason: "owner_target" });
    const res = await DELETE(new Request("https://x", { method: "DELETE" }), params({ userId: TARGET }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("OWNER_TARGET");
  });

  it("404 MEMBER_NOT_FOUND for a non-member target", async () => {
    asRole("owner");
    mockRemoveMember.mockResolvedValueOnce({ ok: false, reason: "member_not_found" });
    const res = await DELETE(new Request("https://x", { method: "DELETE" }), params({ userId: TARGET }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/accounts/[id]/members/[userId]", () => {
  it("changes a role admin↔member", async () => {
    asRole("owner");
    mockChangeRole.mockResolvedValueOnce({ ok: true });
    const res = await PATCH(
      new Request("https://x", { method: "PATCH", body: JSON.stringify({ role: "admin" }) }),
      params({ userId: TARGET }),
    );
    expect(res.status).toBe(200);
    expect(mockChangeRole).toHaveBeenCalledWith({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "admin", actingRole: "owner" });
  });

  it("400s an invalid role in the body (e.g. owner)", async () => {
    asRole("owner");
    const res = await PATCH(
      new Request("https://x", { method: "PATCH", body: JSON.stringify({ role: "owner" }) }),
      params({ userId: TARGET }),
    );
    expect(res.status).toBe(400);
    expect(mockChangeRole).not.toHaveBeenCalled();
  });

  it("403 FORBIDDEN_TARGET when an admin targets another admin", async () => {
    asRole("admin");
    mockChangeRole.mockResolvedValueOnce({ ok: false, reason: "forbidden_target" });
    const res = await PATCH(
      new Request("https://x", { method: "PATCH", body: JSON.stringify({ role: "member" }) }),
      params({ userId: TARGET }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_TARGET");
  });
});
