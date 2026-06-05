/**
 * @jest-environment node
 *
 * Unit tests for the owner-transfer service (TL-2). Mocks the accounts +
 * accountMemberships repositories so no DB is touched. Proves the up-front
 * validation (personal / frozen / not-owner / target-not-member / target-is-owner
 * / not-found), the delegation to the TL-1 RPC wrapper with the right args, and
 * the transfer_failed fallback when the wrapper throws.
 */

const mockGetById = jest.fn();
const mockTransfer = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
  transferAccountOwnershipServiceRole: (...a: unknown[]) => mockTransfer(...a),
}));

const mockGetRoleSR = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRoleSR(...a),
}));

import { transferOwnership } from "@/services/accounts/transferOwnership";
import type { AccountRecord } from "@/contracts/accounts";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";
const TARGET = "33333333-3333-3333-3333-333333333333";

function acct(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT,
    type: "team",
    name: "Team",
    ownerUserId: OWNER,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockGetById.mockReset();
  mockTransfer.mockReset().mockResolvedValue(undefined);
  mockGetRoleSR.mockReset();
});

describe("transferOwnership", () => {
  it("transfers to an existing member: delegates to the RPC and reports new owner", async () => {
    mockGetById
      .mockResolvedValueOnce(acct()) // pre-transfer read
      .mockResolvedValueOnce(acct({ ownerUserId: TARGET })); // post-transfer re-read
    mockGetRoleSR.mockResolvedValueOnce("member");

    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });

    expect(r).toMatchObject({ ok: true, previousOwnerUserId: OWNER, newOwnerUserId: TARGET });
    expect(r.ok && r.account.ownerUserId).toBe(TARGET);
    expect(mockTransfer).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      currentOwnerUserId: OWNER,
      targetUserId: TARGET,
    });
  });

  it("also works when the target is currently an admin", async () => {
    mockGetById.mockResolvedValueOnce(acct()).mockResolvedValueOnce(acct({ ownerUserId: TARGET }));
    mockGetRoleSR.mockResolvedValueOnce("admin");
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r.ok).toBe(true);
    expect(mockTransfer).toHaveBeenCalledTimes(1);
  });

  it("refuses a personal account (never calls the RPC)", async () => {
    mockGetById.mockResolvedValueOnce(acct({ type: "personal" }));
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "personal_account" });
    expect(mockGetRoleSR).not.toHaveBeenCalled();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("refuses a frozen / pending-deletion account", async () => {
    mockGetById.mockResolvedValueOnce(acct({ deletionStatus: "pending_deletion" }));
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("refuses when the caller is not the current owner", async () => {
    mockGetById.mockResolvedValueOnce(acct({ ownerUserId: "someone-else" }));
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "not_owner" });
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("refuses targeting the current owner (self)", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: OWNER });
    expect(r).toEqual({ ok: false, reason: "target_is_owner" });
    expect(mockGetRoleSR).not.toHaveBeenCalled();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("refuses a target that is not a member", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce(null);
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "target_not_member" });
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("refuses a missing account", async () => {
    mockGetById.mockResolvedValueOnce(null);
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "account_not_found" });
  });

  it("returns transfer_failed when the RPC wrapper throws", async () => {
    mockGetById.mockResolvedValueOnce(acct());
    mockGetRoleSR.mockResolvedValueOnce("member");
    mockTransfer.mockRejectedValueOnce(new Error("rpc boom"));
    const r = await transferOwnership({ accountId: ACCOUNT, callerUserId: OWNER, targetUserId: TARGET });
    expect(r).toEqual({ ok: false, reason: "transfer_failed" });
  });
});
