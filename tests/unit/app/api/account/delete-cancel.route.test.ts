/**
 * @jest-environment node
 *
 * Route tests for POST /api/account/delete/cancel — restore during grace
 * (4.ACCOUNT-MODEL-10e). Proves cancel restores the caller's OWN frozen account
 * to active, requires only auth+ownership (no password re-auth — it is the safe
 * restore path), and can never target another account.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

const mockCancelAccountDeletion = jest.fn();
jest.mock("@/services/accounts/accountDeletion", () => ({
  cancelAccountDeletion: (...a: unknown[]) => mockCancelAccountDeletion(...a),
}));

import { POST } from "@/app/api/account/delete/cancel/route";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";

function frozenAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: USER_ID,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: "2026-05-31T00:00:00.000Z",
    purgeAfter: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockCancelAccountDeletion.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("POST /api/account/delete/cancel", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockCancelAccountDeletion).not.toHaveBeenCalled();
  });

  it("restores a frozen account: resolves the OWN (frozen) account and calls cancel", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: "owner@example.com" } },
      error: null,
    });
    // Resolver must keep resolving the FROZEN account (else the freeze locks the
    // owner out of cancelling).
    mockEnsurePersonalAccount.mockResolvedValueOnce(frozenAccount());
    mockCancelAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "active",
      deletionRequestedAt: null,
      purgeAfter: null,
    });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletionStatus: "active",
      requestedAt: null,
      purgeAfter: null,
    });
    expect(mockCancelAccountDeletion).toHaveBeenCalledWith({ accountId: ACCOUNT_ID });
  });

  it("cannot cancel another account: the service is called with the caller's OWN account id only", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID, email: "owner@example.com" } },
      error: null,
    });
    mockEnsurePersonalAccount.mockResolvedValueOnce(frozenAccount());
    mockCancelAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "active",
      deletionRequestedAt: null,
      purgeAfter: null,
    });

    await POST();
    // The route takes no body and resolves the account from the session id, so
    // there is no surface to target a victim account.
    expect(mockEnsurePersonalAccount).toHaveBeenCalledWith(USER_ID);
    expect(mockCancelAccountDeletion).toHaveBeenCalledWith({ accountId: ACCOUNT_ID });
  });
});
