/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/leave (TL-3). Mocks the supabase
 * server client (auth), requireAccountRole, and the leaveAccount service.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockLeave = jest.fn();
jest.mock("@/services/accounts/leaveAccount", () => ({
  leaveAccount: (...a: unknown[]) => mockLeave(...a),
}));

import { POST } from "@/app/api/accounts/[id]/leave/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function leaveReq() {
  return new Request("https://x/api/accounts/acct/leave", { method: "POST" });
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockLeave.mockReset();
});

describe("POST /api/accounts/[id]/leave", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(leaveReq(), params());
    expect(res.status).toBe(401);
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (service never runs — no leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await POST(leaveReq(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("200 when a member leaves — calls the service with the caller's own id", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "member" });
    mockLeave.mockResolvedValueOnce({ ok: true });
    const res = await POST(leaveReq(), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith(CALLER, ACCOUNT, ["owner", "admin", "member"]);
    expect(mockLeave).toHaveBeenCalledWith({ accountId: ACCOUNT, userId: CALLER });
  });

  it.each([
    ["sole_owner_must_transfer", 409, "SOLE_OWNER_MUST_TRANSFER"],
    ["personal_account", 400, "CANNOT_LEAVE_PERSONAL"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["not_member", 403, "NOT_ACCOUNT_MEMBER"],
    ["account_not_found", 404, "ACCOUNT_NOT_FOUND"],
  ])("maps service reason %s → %i %s", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "member" });
    mockLeave.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(leaveReq(), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});
