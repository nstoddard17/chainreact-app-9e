/**
 * @jest-environment node
 *
 * 4.ACCOUNT-MODEL-10e — proves a pending_deletion account stays NON-OPERATIONAL
 * after a deletion request. The 10b freeze gate `requireUserWithAccount` (the
 * single chokepoint guarding workflow create/list/run + AI) must 403 once the
 * account is frozen, and resolve normally once it is restored. This is the
 * enforcement-layer contract the deletion routes rely on (they do NOT
 * re-implement the freeze).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

import { requireUserWithAccount } from "@/app/api/workflows/_shared";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";

function account(deletionStatus: "active" | "pending_deletion") {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: USER_ID,
    deletionStatus,
    deletionRequestedAt: deletionStatus === "pending_deletion" ? "t" : null,
    purgeAfter: deletionStatus === "pending_deletion" ? "t2" : null,
    createdAt: "t0",
    updatedAt: "t1",
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("requireUserWithAccount freeze (post-request non-operational)", () => {
  it("403s with ACCOUNT_PENDING_DELETION once the account is pending_deletion", async () => {
    mockEnsurePersonalAccount.mockResolvedValueOnce(account("pending_deletion"));
    const result = await requireUserWithAccount();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).code).toBe("ACCOUNT_PENDING_DELETION");
    }
  });

  it("resolves normally when the account is active (restored after cancel)", async () => {
    mockEnsurePersonalAccount.mockResolvedValueOnce(account("active"));
    const result = await requireUserWithAccount();
    expect(result).toEqual({ ok: true, userId: USER_ID, accountId: ACCOUNT_ID });
  });
});
