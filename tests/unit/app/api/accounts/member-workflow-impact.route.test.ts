/**
 * @jest-environment node
 *
 * Route tests for GET /api/accounts/[id]/members/[userId]/workflow-impact
 * (Slice 4.TEAM-WORKFLOWS-7 / TW-5). Mocks auth + requireAccountRole + the
 * membership service. The load-bearing checks: an authorized owner/admin gets
 * the count; an unauthenticated / non-member / unauthorized-target caller gets a
 * gate failure and NEVER the impact info.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockGetImpact = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  getMemberWorkflowImpact: (...a: unknown[]) => mockGetImpact(...a),
}));

import { GET } from "@/app/api/accounts/[id]/members/[userId]/workflow-impact/route";

const CALLER = "owner-1";
const ACCOUNT = "team-1";
const TARGET = "user-2";

function params() {
  return {
    params: Promise.resolve({ id: ACCOUNT, userId: TARGET }),
  } as { params: Promise<{ id: string; userId: string }> };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockGetImpact.mockReset();
});

describe("GET /members/[userId]/workflow-impact", () => {
  it("returns the affected-workflow count for an authorized owner/admin", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockGetImpact.mockResolvedValueOnce({ ok: true, affectedWorkflowCount: 3 });

    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ affectedWorkflowCount: 3 });
    expect(mockGetImpact).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      targetUserId: TARGET,
      actingRole: "owner",
    });
  });

  it("401 when unauthenticated — no role check, no impact lookup", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(401);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockGetImpact).not.toHaveBeenCalled();
  });

  it("403 (no impact) when the caller is not an owner/admin member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockGetImpact).not.toHaveBeenCalled();
  });

  it("403 (no impact) when the caller is not a member of the account", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockGetImpact).not.toHaveBeenCalled();
  });

  it("maps a service gate failure (owner target) to 403 OWNER_TARGET", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockGetImpact.mockResolvedValueOnce({ ok: false, reason: "owner_target" });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("OWNER_TARGET");
  });
});
