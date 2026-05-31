/**
 * @jest-environment node
 *
 * 4.ACCOUNT-MODEL-11c — requireUserWithAccount now delegates account selection
 * to resolveActiveAccount. These tests drive the REAL resolver (repos mocked) so
 * the full gate → resolver → HTTP-mapping chain runs end to end:
 *   - no-explicit + NULL pointer + active personal → personal account (launch
 *     behavior, identical to pre-11c).
 *   - frozen personal floor → 403 ACCOUNT_PENDING_DELETION (10b freeze shape,
 *     preserved verbatim).
 *   - explicit member → resolves; explicit non-member → 403 NOT_ACCOUNT_MEMBER
 *     (NEVER falls back); explicit frozen → 403 ACCOUNT_PENDING_DELETION.
 *   - valid stored active → honored; stale stored active → cleared + personal.
 *   - unauthenticated → 401 (resolver never consulted).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockEnsurePersonal = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonal(...a),
}));

const mockGetActiveAccountId = jest.fn();
const mockClearActiveAccountId = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  getActiveAccountId: (...a: unknown[]) => mockGetActiveAccountId(...a),
  clearActiveAccountId: (...a: unknown[]) => mockClearActiveAccountId(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

import { requireUserWithAccount } from "@/app/api/workflows/_shared";

const USER = "user-1";
const PERSONAL = "acct-user-1";
const TEAM = "acct-team";

function account(id: string, deletionStatus: "active" | "pending_deletion" = "active") {
  return {
    id,
    type: "personal",
    name: "Acct",
    ownerUserId: USER,
    deletionStatus,
    deletionRequestedAt: deletionStatus === "pending_deletion" ? "t" : null,
    purgeAfter: deletionStatus === "pending_deletion" ? "t2" : null,
    createdAt: "t0",
    updatedAt: "t1",
  };
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockEnsurePersonal.mockReset().mockResolvedValue(account(PERSONAL));
  mockGetActiveAccountId.mockReset();
  mockClearActiveAccountId.mockReset().mockResolvedValue(undefined);
  mockIsMember.mockReset();
  mockGetById.mockReset();
});

describe("requireUserWithAccount — resolver-backed gate (11c)", () => {
  it("no-explicit + NULL pointer resolves the personal account (launch behavior unchanged)", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(null);
    const r = await requireUserWithAccount();
    expect(r).toEqual({ ok: true, userId: USER, accountId: PERSONAL });
  });

  it("frozen personal floor → 403 ACCOUNT_PENDING_DELETION (exact pre-11c shape)", async () => {
    mockEnsurePersonal.mockResolvedValueOnce(account(PERSONAL, "pending_deletion"));
    mockGetActiveAccountId.mockResolvedValueOnce(null);
    const r = await requireUserWithAccount();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect(await r.response.json()).toEqual({
        error: "This account is pending deletion.",
        code: "ACCOUNT_PENDING_DELETION",
      });
    }
  });

  it("explicit member account resolves through the gate", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(account(TEAM));
    const r = await requireUserWithAccount(TEAM);
    expect(r).toEqual({ ok: true, userId: USER, accountId: TEAM });
    // Explicit path never consults the personal fallback.
    expect(mockEnsurePersonal).not.toHaveBeenCalled();
  });

  it("explicit non-member → 403 NOT_ACCOUNT_MEMBER (no silent fallback)", async () => {
    mockIsMember.mockResolvedValueOnce(false);
    const r = await requireUserWithAccount(TEAM);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect((await r.response.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    }
    expect(mockEnsurePersonal).not.toHaveBeenCalled();
  });

  it("explicit frozen account → 403 ACCOUNT_PENDING_DELETION", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(account(TEAM, "pending_deletion"));
    const r = await requireUserWithAccount(TEAM);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect((await r.response.json()).code).toBe("ACCOUNT_PENDING_DELETION");
    }
  });

  it("a valid stored active account is honored", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(account(TEAM));
    const r = await requireUserWithAccount();
    expect(r).toEqual({ ok: true, userId: USER, accountId: TEAM });
    expect(mockClearActiveAccountId).not.toHaveBeenCalled();
  });

  it("a stale/non-member stored active clears and falls back to personal", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(false);
    const r = await requireUserWithAccount();
    expect(r).toEqual({ ok: true, userId: USER, accountId: PERSONAL });
    expect(mockClearActiveAccountId).toHaveBeenCalledWith(USER);
  });

  it("unauthenticated → 401, resolver never consulted", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const r = await requireUserWithAccount();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
    expect(mockEnsurePersonal).not.toHaveBeenCalled();
    expect(mockGetActiveAccountId).not.toHaveBeenCalled();
  });
});
