/**
 * @jest-environment node
 *
 * Route tests for POST /api/account/active — set active account
 * (4.ACCOUNT-MODEL-11d). Mocks supabase auth + the setActiveAccount service so
 * the route's own guards (auth → parse → service → HTTP mapping) are isolated.
 * The service-level validation (membership/freeze + no-write-on-failure) is
 * proven in tests/unit/services/accounts/activeAccount.test.ts.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockSetActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  setActiveAccount: (...a: unknown[]) => mockSetActiveAccount(...a),
}));

import { POST } from "@/app/api/account/active/route";

const USER = "user-1";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/active", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockSetActiveAccount.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("POST /api/account/active", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ accountId: ACCOUNT }));
    expect(res.status).toBe(401);
    expect(mockSetActiveAccount).not.toHaveBeenCalled();
  });

  it("400s a missing account id", async () => {
    signedIn();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockSetActiveAccount).not.toHaveBeenCalled();
  });

  it("400s a malformed (non-uuid) account id", async () => {
    signedIn();
    const res = await POST(req({ accountId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockSetActiveAccount).not.toHaveBeenCalled();
  });

  it("sets the active account on success and returns the payload", async () => {
    signedIn();
    mockSetActiveAccount.mockResolvedValueOnce({
      ok: true,
      account: { id: ACCOUNT, name: "Team", type: "personal", ownerUserId: USER },
    });
    const res = await POST(req({ accountId: ACCOUNT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      activeAccountId: ACCOUNT,
      account: { id: ACCOUNT, name: "Team", type: "personal" },
    });
    expect(mockSetActiveAccount).toHaveBeenCalledWith(USER, ACCOUNT);
  });

  it("403s NOT_ACCOUNT_MEMBER for a non-member target", async () => {
    signedIn();
    mockSetActiveAccount.mockResolvedValueOnce({
      ok: false,
      reason: "not_member",
      accountId: ACCOUNT,
    });
    const res = await POST(req({ accountId: ACCOUNT }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("403s ACCOUNT_PENDING_DELETION for a frozen target", async () => {
    signedIn();
    mockSetActiveAccount.mockResolvedValueOnce({
      ok: false,
      reason: "account_frozen",
      accountId: ACCOUNT,
    });
    const res = await POST(req({ accountId: ACCOUNT }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });

  it("cannot set another user's active account: userId comes from the session, not the body", async () => {
    signedIn();
    mockSetActiveAccount.mockResolvedValueOnce({
      ok: true,
      account: { id: ACCOUNT, name: "Team", type: "personal", ownerUserId: USER },
    });
    // Attacker tries to smuggle a victim user id in the body.
    await POST(req({ accountId: ACCOUNT, userId: "victim-user" }));
    // The service is invoked with the SESSION user, never the body value.
    expect(mockSetActiveAccount).toHaveBeenCalledWith(USER, ACCOUNT);
  });
});
