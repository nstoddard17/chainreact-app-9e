/**
 * @jest-environment node
 *
 * Route tests for GET /api/accounts/[id]/leave-impact (TL-3). Self-scoped count.
 * Mocks the supabase server client (auth), requireAccountRole, and the impact
 * counter. The count is always the caller's own and never another member's.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockCount = jest.fn();
jest.mock("@/services/accounts/offboardingImpact", () => ({
  countImpactedWorkflowsForMember: (...a: unknown[]) => mockCount(...a),
}));

import { GET } from "@/app/api/accounts/[id]/leave-impact/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function impactReq() {
  return new Request("https://x/api/accounts/acct/leave-impact");
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockCount.mockReset();
});

describe("GET /api/accounts/[id]/leave-impact", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(impactReq(), params());
    expect(res.status).toBe(401);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("returns the caller's own impacted count (counts for the caller only)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "member" });
    mockCount.mockResolvedValueOnce(3);
    const res = await GET(impactReq(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ affectedWorkflowCount: 3 });
    // Always the caller's own user id — never a target from request input.
    expect(mockCount).toHaveBeenCalledWith(ACCOUNT, CALLER);
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (no count leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await GET(impactReq(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockCount).not.toHaveBeenCalled();
  });
});
