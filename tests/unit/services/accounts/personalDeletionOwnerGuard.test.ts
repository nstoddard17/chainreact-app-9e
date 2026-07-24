/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-2 — the CANONICAL sole-owner precondition.
 *
 * A user who still OWNS a Team / Business (organization) account may not delete their
 * personal account: the purge ends in `auth.admin.deleteUser`, and
 * `accounts.owner_user_id -> auth.users ON DELETE RESTRICT` would strand it — but more
 * importantly, the team must not be left ownerless and its subscription must not be
 * collateral damage.
 *
 * This guard used to live ONLY in `app/api/account/delete/route.ts`. That was survivable
 * while the service merely flipped a status column; once ACCOUNT-BILLING-LIFECYCLE-1 made the
 * service cancel a real Stripe subscription, a route-only guard meant any other entry point
 * would freeze the account AND cancel billing with no ownership check whatsoever. It now
 * lives in `requestAccountDeletion`, so every caller inherits it.
 *
 * These tests wire the REAL service and mock only the repositories + the billing seam, and
 * assert the property that actually matters: **a blocked request changes nothing, anywhere.**
 */

const mockGetByIdServiceRole = jest.fn();
const mockSetDeletionPending = jest.fn();
const mockClearDeletion = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockListOwnedTeamOrg = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
  setDeletionPendingServiceRole: (...a: unknown[]) => mockSetDeletionPending(...a),
  clearDeletionServiceRole: (...a: unknown[]) => mockClearDeletion(...a),
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
}));

const mockInsertPending = jest.fn();
const mockMarkPendingCancelled = jest.fn();
jest.mock("@/repositories/accountDeletions", () => ({
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
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

const PERSONAL_ID = "acct-personal";
const OWNER_ID = "user-owner";

function personalAccount(deletionStatus = "active") {
  return {
    id: PERSONAL_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: OWNER_ID,
    deletionStatus,
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

/** Assert that the request produced ZERO side effects of any kind. */
function expectNoSideEffects() {
  expect(mockSetDeletionPending).not.toHaveBeenCalled(); // no freeze
  expect(mockInsertPending).not.toHaveBeenCalled(); // no pending-deletion record
  expect(mockCancelForDeletion).not.toHaveBeenCalled(); // no Stripe call
  expect(mockClearDeletion).not.toHaveBeenCalled();
  expect(mockMarkPendingCancelled).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const m of [
    mockGetByIdServiceRole, mockSetDeletionPending, mockClearDeletion,
    mockGetDeletionStatus, mockListOwnedTeamOrg, mockInsertPending,
    mockMarkPendingCancelled, mockCancelForDeletion,
  ]) m.mockReset();

  mockGetByIdServiceRole.mockResolvedValue(personalAccount());
  mockSetDeletionPending.mockResolvedValue(personalAccount("pending_deletion"));
  mockInsertPending.mockResolvedValue({});
  mockCancelForDeletion.mockResolvedValue({ ok: true, outcome: "canceled" });
  mockListOwnedTeamOrg.mockResolvedValue([]);
});

describe("blocked while the owner still owns other accounts", () => {
  it.each([
    ["a Team", [{ id: "t1", name: "Acme Team", type: "team" }]],
    ["a Business", [{ id: "o1", name: "Acme Biz", type: "organization" }]],
  ])("refuses when the user owns %s account", async (_label, owned) => {
    mockListOwnedTeamOrg.mockResolvedValue(owned);

    await expect(
      requestAccountDeletion({ accountId: PERSONAL_ID, requestedByUserId: OWNER_ID }),
    ).rejects.toBeInstanceOf(OwnedAccountsBlockDeletionError);

    expectNoSideEffects();
  });

  it("returns ONE actionable result listing every owned account", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([
      { id: "t1", name: "Acme Team", type: "team" },
      { id: "o1", name: "Acme Biz", type: "organization" },
      { id: "t2", name: "Side Team", type: "team" },
    ]);

    const err = await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OwnedAccountsBlockDeletionError);
    const blocked = err as OwnedAccountsBlockDeletionError;
    expect(blocked.code).toBe("ACCOUNT_HAS_OWNED_TEAMS");
    expect(blocked.ownedAccounts).toHaveLength(3);
    expect(blocked.message).toMatch(/transfer ownership or delete/i);
    // Actionable, not a bare failure — and it never implies cancelling billing is enough.
    expect(blocked.message).not.toMatch(/cancel.*(subscription|plan)/i);
  });

  it("runs BEFORE the freeze, the pending record, and the Stripe cancellation", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);

    await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    }).catch(() => undefined);

    // The ownership read happened...
    expect(mockListOwnedTeamOrg).toHaveBeenCalledTimes(1);
    // ...and nothing downstream of it ever ran.
    expectNoSideEffects();
  });

  it("uses authoritative ownership for the ACCOUNT'S OWNER, not the requesting caller", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);

    await requestAccountDeletion({
      accountId: PERSONAL_ID,
      // A different actor (e.g. a system/admin caller) — the guard must still evaluate the
      // ACCOUNT OWNER's holdings, never the caller's, and never a client-supplied claim.
      requestedByUserId: "some-other-actor",
    }).catch(() => undefined);

    expect(mockListOwnedTeamOrg).toHaveBeenCalledWith(OWNER_ID);
    expect(mockListOwnedTeamOrg).not.toHaveBeenCalledWith("some-other-actor");
  });

  it("examines ALL of the owner's accounts — active-account selection is irrelevant", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);
    await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    }).catch(() => undefined);

    // The lookup is keyed on the USER, so it spans every account they own; there is no
    // account-scoped/active-account filter that could hide one.
    expect(mockListOwnedTeamOrg).toHaveBeenCalledWith(OWNER_ID);
    expect(mockListOwnedTeamOrg).toHaveBeenCalledTimes(1);
  });

  it("stays harmless when repeated", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);

    for (let i = 0; i < 3; i++) {
      await expect(
        requestAccountDeletion({ accountId: PERSONAL_ID, requestedByUserId: OWNER_ID }),
      ).rejects.toBeInstanceOf(OwnedAccountsBlockDeletionError);
    }
    expectNoSideEffects();
  });

  it("a blocked account never enters the pending-deletion worklist", async () => {
    // Both the reconciliation and purge worklists are derived from
    // `deletion_status = 'pending_deletion'`. A blocked request never writes that status,
    // so a blocked account is STRUCTURALLY unreachable by either sweep.
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);
    await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    }).catch(() => undefined);

    expect(mockSetDeletionPending).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
  });
});

describe("allowed when the owner owns nothing else", () => {
  it("proceeds for a user who owns no Team/Business account", async () => {
    const state = await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockSetDeletionPending).toHaveBeenCalledTimes(1);
    expect(mockCancelForDeletion).toHaveBeenCalledWith(PERSONAL_ID);
  });

  it("proceeds for a non-owner MEMBER of a team (membership alone never blocks)", async () => {
    // `listOwnedTeamOrgAccountSummaries` filters on `owner_user_id`, so a plain member /
    // admin of a team returns []. Being in a team is not owning one.
    mockListOwnedTeamOrg.mockResolvedValue([]);

    const state = await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    // Only the personal account's billing is touched — the team's is never named.
    expect(mockCancelForDeletion).toHaveBeenCalledTimes(1);
    expect(mockCancelForDeletion).toHaveBeenCalledWith(PERSONAL_ID);
  });

  it("proceeds after ownership transfer (the owned list is now empty)", async () => {
    // Before transfer: blocked.
    mockListOwnedTeamOrg.mockResolvedValueOnce([{ id: "t1", name: "T", type: "team" }]);
    await expect(
      requestAccountDeletion({ accountId: PERSONAL_ID, requestedByUserId: OWNER_ID }),
    ).rejects.toBeInstanceOf(OwnedAccountsBlockDeletionError);
    expectNoSideEffects();

    // After transfer: the canonical ownership read returns nothing, so deletion proceeds and
    // still only ever cancels the PERSONAL subscription.
    mockListOwnedTeamOrg.mockResolvedValue([]);
    const state = await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockCancelForDeletion).toHaveBeenCalledWith(PERSONAL_ID);
    expect(mockCancelForDeletion).toHaveBeenCalledTimes(1);
  });
});

describe("scope of the guard", () => {
  it("does NOT apply when the account being deleted is itself a team account", async () => {
    // Deleting the team IS the resolution of that ownership — blocking it would be
    // self-contradictory. (Team deletion is not shipped; this pins the service contract for
    // when it is.)
    mockGetByIdServiceRole.mockResolvedValue({
      ...personalAccount(),
      id: "acct-team",
      type: "team",
    });
    mockSetDeletionPending.mockResolvedValue({
      ...personalAccount("pending_deletion"),
      id: "acct-team",
      type: "team",
    });
    mockListOwnedTeamOrg.mockResolvedValue([
      { id: "acct-team", name: "Acme", type: "team" },
    ]);

    const state = await requestAccountDeletion({
      accountId: "acct-team",
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockListOwnedTeamOrg).not.toHaveBeenCalled();
  });

  it("does not re-block an ALREADY-frozen account (billing retry must stay reachable)", async () => {
    // The account can only have become pending by passing the guard. Re-checking here would
    // strand a frozen account that can never finish cancelling its subscription.
    mockGetByIdServiceRole.mockResolvedValue(personalAccount("pending_deletion"));
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "t1", name: "T", type: "team" }]);

    const state = await requestAccountDeletion({
      accountId: PERSONAL_ID,
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    // The retry ran; no new freeze/audit row was written.
    expect(mockCancelForDeletion).toHaveBeenCalledWith(PERSONAL_ID);
    expect(mockSetDeletionPending).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
  });
});
