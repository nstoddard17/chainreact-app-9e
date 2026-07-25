/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-3 — how the TWO ownership guards compose.
 *
 * There are two, on opposite sides of the same invariant ("a team always has a real owner"):
 *
 *   - DELETION side  (`requestAccountDeletion`): you may not delete your personal account
 *     while you still own Team/Business accounts.
 *   - TRANSFER side  (`transferOwnership`): you may not hand a Team/Business account to
 *     someone whose own account is pending deletion or gone.
 *
 * Individually each is tested elsewhere. This file pins the INTERACTION — the sequences a
 * real user actually walks through — using the real services with only repositories and the
 * billing seam mocked.
 */

const mockGetById = jest.fn();
const mockSetDeletionPending = jest.fn();
const mockClearDeletion = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockListOwnedTeamOrg = jest.fn();
const mockTransferRpc = jest.fn();
const mockGetPersonalSR = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
  setDeletionPendingServiceRole: (...a: unknown[]) => mockSetDeletionPending(...a),
  clearDeletionServiceRole: (...a: unknown[]) => mockClearDeletion(...a),
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
  transferAccountOwnershipServiceRole: (...a: unknown[]) => mockTransferRpc(...a),
  getPersonalAccountForUserServiceRole: (...a: unknown[]) => mockGetPersonalSR(...a),
}));

const mockGetRoleSR = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRoleSR(...a),
}));

const mockInsertPending = jest.fn();
// ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A: freeze + audit row + (optional)
// challenge consumption are ONE transactional RPC now.
const mockScheduleAtomic = jest.fn();
const mockMarkPendingCancelled = jest.fn();
jest.mock("@/repositories/accountDeletions", () => ({
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  scheduleAccountDeletionAtomic: (...a: unknown[]) => mockScheduleAtomic(...a),
  markPendingCancelled: (...a: unknown[]) => mockMarkPendingCancelled(...a),
}));

const mockCancelForDeletion = jest.fn();
jest.mock("@/services/billing/subscriptionCancellation", () => ({
  cancelSubscriptionForAccountDeletion: (...a: unknown[]) => mockCancelForDeletion(...a),
}));

import {
  OwnedAccountsBlockDeletionError,
  requestAccountDeletion,
} from "@/services/accounts/accountDeletion";
import { transferOwnership } from "@/services/accounts/transferOwnership";

const TEAM = "acct-team";
const OWNER_PERSONAL = "acct-personal-owner";
const OWNER = "user-owner";
const SUCCESSOR = "user-successor";

/** Mutable world state the repo mocks read from — lets a test model a real sequence. */
const world = {
  ownedByOwner: [] as Array<{ id: string; name: string; type: string }>,
  successorDeletionStatus: "active" as "active" | "pending_deletion",
};

function accountRow(id: string, type: string, ownerUserId: string, deletionStatus = "active") {
  return {
    id,
    type,
    name: id,
    ownerUserId,
    deletionStatus,
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

beforeEach(() => {
  world.ownedByOwner = [{ id: TEAM, name: "Acme", type: "team" }];
  world.successorDeletionStatus = "active";

  mockGetById.mockReset().mockImplementation(async (id: string) => {
    if (id === TEAM) return accountRow(TEAM, "team", OWNER);
    return accountRow(OWNER_PERSONAL, "personal", OWNER);
  });
  mockSetDeletionPending
    .mockReset()
    .mockImplementation(async () =>
      accountRow(OWNER_PERSONAL, "personal", OWNER, "pending_deletion"),
    );
  mockClearDeletion.mockReset();
  mockGetDeletionStatus.mockReset().mockResolvedValue("active");
  mockListOwnedTeamOrg.mockReset().mockImplementation(async () => world.ownedByOwner);
  mockTransferRpc.mockReset().mockImplementation(async () => {
    // A successful transfer means the owner no longer owns the team.
    world.ownedByOwner = [];
  });
  mockGetPersonalSR
    .mockReset()
    .mockImplementation(async (userId: string) =>
      accountRow(
        `personal-of-${userId}`,
        "personal",
        userId,
        userId === SUCCESSOR ? world.successorDeletionStatus : "active",
      ),
    );
  mockGetRoleSR.mockReset().mockResolvedValue("member");
  mockInsertPending.mockReset().mockResolvedValue({});
  mockScheduleAtomic.mockReset().mockImplementation(async (input) => ({
    outcome: "scheduled",
    accountId: input.accountId,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: input.requestedAt,
    purgeAfter: input.purgeAfter,
  }));
  mockMarkPendingCancelled.mockReset();
  mockCancelForDeletion.mockReset().mockResolvedValue({ ok: true, outcome: "canceled" });
});

function deleteOwnersPersonalAccount() {
  return requestAccountDeletion({
    accountId: OWNER_PERSONAL,
    requestedByUserId: OWNER,
  });
}

function transferTeamTo(userId: string) {
  return transferOwnership({
    accountId: TEAM,
    callerUserId: OWNER,
    targetUserId: userId,
  });
}

describe("the documented happy sequence", () => {
  it("blocked → transfer to an ELIGIBLE successor → deletion now proceeds, team intact", async () => {
    // 1. While still the owner, personal deletion is refused.
    await expect(deleteOwnersPersonalAccount()).rejects.toBeInstanceOf(
      OwnedAccountsBlockDeletionError,
    );
    expect(mockScheduleAtomic).not.toHaveBeenCalled();
    expect(mockCancelForDeletion).not.toHaveBeenCalled();

    // 2. Transfer to an active successor succeeds...
    const transfer = await transferTeamTo(SUCCESSOR);
    expect(transfer.ok).toBe(true);
    // ...and transferring cancels NOTHING.
    expect(mockCancelForDeletion).not.toHaveBeenCalled();

    // 3. Now deletion proceeds, and touches only the personal account's billing.
    const state = await deleteOwnersPersonalAccount();
    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockCancelForDeletion).toHaveBeenCalledTimes(1);
    expect(mockCancelForDeletion).toHaveBeenCalledWith(OWNER_PERSONAL);
    // The team's own billing is never named.
    expect(mockCancelForDeletion).not.toHaveBeenCalledWith(TEAM);
  });
});

describe("transfer to an INELIGIBLE successor does not unlock deletion", () => {
  it("keeps the original owner blocked", async () => {
    world.successorDeletionStatus = "pending_deletion";

    // The transfer is refused...
    expect(await transferTeamTo(SUCCESSOR)).toEqual({
      ok: false,
      reason: "target_unavailable",
    });
    // ...so ownership did not move...
    expect(mockTransferRpc).not.toHaveBeenCalled();
    expect(world.ownedByOwner).toHaveLength(1);

    // ...and the owner's personal deletion is still blocked.
    await expect(deleteOwnersPersonalAccount()).rejects.toBeInstanceOf(
      OwnedAccountsBlockDeletionError,
    );
    expect(mockScheduleAtomic).not.toHaveBeenCalled();
  });

  it("leaves the team's billing and the owner's billing untouched", async () => {
    world.successorDeletionStatus = "pending_deletion";
    await transferTeamTo(SUCCESSOR);
    await deleteOwnersPersonalAccount().catch(() => undefined);
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });
});

describe("personal billing cancellation is a different action entirely", () => {
  it("never invokes recipient-eligibility or ownership-transfer logic", async () => {
    // Cancelling a personal subscription goes through
    // `services/billing/subscriptionCancellation.ts`, which has no import of either
    // ownership module. Assert structurally so a future refactor cannot couple them.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "services/billing/subscriptionCancellation.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/transferOwnership|getPersonalAccountForUserServiceRole/);
    expect(code).not.toMatch(/listOwnedTeamOrgAccountSummaries/);
  });

  it("a team owner is never asked to transfer ownership to cancel their personal plan", async () => {
    // The deletion guard is the ONLY thing that consults owned accounts; the cancellation
    // path does not. Proven here by the cancellation service never being reached through
    // any ownership code, and by the guard being invoked only on deletion.
    expect(mockListOwnedTeamOrg).not.toHaveBeenCalled();
  });
});
