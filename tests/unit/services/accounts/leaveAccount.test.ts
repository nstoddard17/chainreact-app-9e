/**
 * @jest-environment node
 *
 * Unit tests for the leave-account service (TL-3). Mocks the accounts /
 * memberships / integrations / userProfiles repos so no DB is touched. Proves
 * the gate (personal / frozen / not-member / sole-owner), and that a successful
 * leave runs the SAME offboarding sequence as removeMember, in order:
 * soft-disconnect personal creds → remove membership → clear active pointer.
 */

const order: string[] = [];

const mockGetById = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
}));

const mockGetRoleSR = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRoleSR(...a),
  removeMembershipServiceRole: (...a: unknown[]) => {
    order.push("remove");
    return mockRemove(...a);
  },
}));

const mockSoftDisconnect = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  softDisconnectPersonalForMember: (...a: unknown[]) => {
    order.push("disconnect");
    return mockSoftDisconnect(...a);
  },
}));

const mockClearActive = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  clearActiveAccountIfMatchesServiceRole: (...a: unknown[]) => {
    order.push("clearActive");
    return mockClearActive(...a);
  },
}));

import { leaveAccount } from "@/services/accounts/leaveAccount";
import type { AccountRecord } from "@/contracts/accounts";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

function acct(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT,
    type: "team",
    name: "Team",
    ownerUserId: "owner-x",
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  order.length = 0;
  mockGetById.mockReset();
  mockGetRoleSR.mockReset();
  mockRemove.mockReset().mockResolvedValue(undefined);
  mockSoftDisconnect.mockReset().mockResolvedValue({ disconnectedCount: 0, disconnectedProviders: [] });
  mockClearActive.mockReset().mockResolvedValue(undefined);
});

describe("leaveAccount", () => {
  it("a member leaves: runs offboarding in order (disconnect → remove → clearActive)", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce("member");

    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });

    expect(r).toEqual({ ok: true });
    expect(order).toEqual(["disconnect", "remove", "clearActive"]);
    expect(mockSoftDisconnect).toHaveBeenCalledWith({ accountId: ACCOUNT, connectedByUserId: USER });
    expect(mockRemove).toHaveBeenCalledWith(ACCOUNT, USER);
    expect(mockClearActive).toHaveBeenCalledWith(USER, ACCOUNT);
  });

  it("an admin can leave", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce("admin");
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: true });
    expect(order).toEqual(["disconnect", "remove", "clearActive"]);
  });

  it("a sole owner is blocked and NO offboarding runs", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce("owner");
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: false, reason: "sole_owner_must_transfer" });
    expect(order).toEqual([]);
    expect(mockSoftDisconnect).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("refuses a personal account (never reads role / offboards)", async () => {
    mockGetById.mockResolvedValueOnce(acct({ type: "personal" }));
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: false, reason: "personal_account" });
    expect(mockGetRoleSR).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it("refuses a frozen / pending-deletion account", async () => {
    mockGetById.mockResolvedValueOnce(acct({ deletionStatus: "pending_deletion" }));
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
    expect(order).toEqual([]);
  });

  it("refuses a non-member (no offboarding)", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce(null);
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: false, reason: "not_member" });
    expect(order).toEqual([]);
  });

  it("refuses a missing account", async () => {
    mockGetById.mockResolvedValueOnce(null);
    const r = await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(r).toEqual({ ok: false, reason: "account_not_found" });
  });

  it("delegates personal-only scoping to softDisconnectPersonalForMember (account/service creds untouched)", async () => {
    // The service never names a provider — it hands (accountId, connectedByUserId)
    // to the helper, which is the single source of truth for "personal only".
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce("member");
    await leaveAccount({ accountId: ACCOUNT, userId: USER });
    expect(mockSoftDisconnect).toHaveBeenCalledTimes(1);
    expect(mockSoftDisconnect).toHaveBeenCalledWith({ accountId: ACCOUNT, connectedByUserId: USER });
  });
});
