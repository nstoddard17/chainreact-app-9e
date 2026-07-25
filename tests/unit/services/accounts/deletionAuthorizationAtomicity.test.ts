/**
 * @jest-environment node
 *
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A — the authorization/transition
 * atomicity contract, at the SERVICE boundary.
 *
 * The original implementation spent the user's verified email challenge in its own
 * Data API call and only then attempted the freeze + audit-row writes. That was
 * replay-safe, but the failure paths disagreed: a sole-owner refusal, or any failed
 * durable write, burned the code while scheduling nothing.
 *
 * These tests pin the corrected contract at the seam this service owns — that the
 * ONLY place a challenge can be spent is inside the same transactional call that
 * performs the transition, and that every refusal reaches that call either not at
 * all or without a commit. The transaction's real behavior (rollback, row locking,
 * concurrency) is proved against Postgres in
 * tests/integration/accounts/deletionAuthorizationAtomicity.dev.test.ts — SQL
 * semantics cannot be honestly mocked.
 */

const mockGetByIdServiceRole = jest.fn();
const mockListOwnedTeamOrg = jest.fn();
const mockSetDeletionPending = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockClearDeletion = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
  setDeletionPendingServiceRole: (...a: unknown[]) => mockSetDeletionPending(...a),
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  clearDeletionServiceRole: (...a: unknown[]) => mockClearDeletion(...a),
}));

const mockScheduleAtomic = jest.fn();
const mockInsertPending = jest.fn();
const mockMarkPendingCancelled = jest.fn();
jest.mock("@/repositories/accountDeletions", () => ({
  scheduleAccountDeletionAtomic: (...a: unknown[]) => mockScheduleAtomic(...a),
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  markPendingCancelled: (...a: unknown[]) => mockMarkPendingCancelled(...a),
}));

/**
 * The challenge store is mocked wholesale so we can assert the STRONGEST form of
 * the contract: the deletion service never calls ANY challenge-mutating
 * repository function directly. The only consumption path is the SQL inside
 * `scheduleAccountDeletionAtomic`.
 */
const challengeRepo = {
  insertChallenge: jest.fn(),
  getOpenChallenge: jest.fn(),
  invalidateOpenChallenges: jest.fn(),
  invalidateChallenge: jest.fn(),
  recordFailedAttempt: jest.fn(),
  markVerified: jest.fn(),
  consumeVerifiedChallenge: jest.fn(),
  countSendsSince: jest.fn(),
  deleteSettledChallenges: jest.fn(),
};
jest.mock("@/repositories/security/sensitiveActionChallenges", () => challengeRepo);

const mockCancelForDeletion = jest.fn();
jest.mock("@/services/billing/subscriptionCancellation", () => ({
  cancelSubscriptionForAccountDeletion: (...a: unknown[]) => mockCancelForDeletion(...a),
}));

import {
  DeletionAuthorizationRequiredError,
  OwnedAccountsBlockDeletionError,
  requestAccountDeletion,
} from "@/services/accounts/accountDeletion";

const ACCOUNT_ID = "acct-1";
const OWNER_ID = "user-1";
const NOW = new Date("2026-07-24T12:00:00.000Z");

const AUTHORIZATION = {
  challengeId: "chal-1",
  userId: OWNER_ID,
  purpose: "delete_account",
  sessionBinding: "session-digest",
  emailBinding: "email-digest",
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: OWNER_ID,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function scheduledOutcome(input: { accountId: string; requestedAt: string; purgeAfter: string }) {
  return {
    outcome: "scheduled" as const,
    accountId: input.accountId,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: input.requestedAt,
    purgeAfter: input.purgeAfter,
  };
}

/** Every challenge-mutating repository function. None may be called from here. */
function challengeMutators() {
  return [
    challengeRepo.consumeVerifiedChallenge,
    challengeRepo.invalidateChallenge,
    challengeRepo.invalidateOpenChallenges,
    challengeRepo.markVerified,
    challengeRepo.recordFailedAttempt,
  ];
}

function expectNoChallengeMutation() {
  for (const fn of challengeMutators()) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(challengeRepo).forEach((fn) => fn.mockReset());
  mockGetByIdServiceRole.mockResolvedValue(account());
  mockListOwnedTeamOrg.mockResolvedValue([]);
  mockCancelForDeletion.mockResolvedValue({ ok: true, outcome: "not_applicable" });
  mockScheduleAtomic.mockImplementation(async (input) => scheduledOutcome(input));
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

function request(overrides: Record<string, unknown> = {}) {
  return requestAccountDeletion({
    accountId: ACCOUNT_ID,
    requestedByUserId: OWNER_ID,
    now: NOW,
    authorization: AUTHORIZATION,
    ...overrides,
  });
}

describe("the challenge can ONLY be spent inside the transition transaction", () => {
  it("threads the authorization into the atomic call and consumes nothing itself", async () => {
    await request();

    expect(mockScheduleAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        requestedByUserId: OWNER_ID,
        requestedAt: NOW.toISOString(),
        challenge: AUTHORIZATION,
      }),
    );
    // The decisive assertion: the service performs NO standalone challenge write.
    expectNoChallengeMutation();
  });

  it("performs the freeze and the audit row through the SAME call (they cannot diverge)", async () => {
    await request();
    expect(mockScheduleAtomic).toHaveBeenCalledTimes(1);
    // The old two-write sequence is gone, so a half-applied transition is unreachable.
    expect(mockSetDeletionPending).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
  });
});

describe("eligibility failure leaves the authorization usable", () => {
  it("refuses a sole-owner-blocked deletion WITHOUT entering the transaction", async () => {
    mockListOwnedTeamOrg.mockResolvedValue([{ id: "team-1", name: "Acme", type: "team" }]);

    await expect(request()).rejects.toBeInstanceOf(OwnedAccountsBlockDeletionError);

    // Nothing was scheduled and — critically — nothing was spent. The user keeps
    // the code they already received and can finish after transferring the team.
    expect(mockScheduleAtomic).not.toHaveBeenCalled();
    expectNoChallengeMutation();
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });

  it("refuses an in-transaction ownership race the same way, with the code intact", async () => {
    // The read-only pre-check passed, but the transaction re-checked and refused
    // (the user acquired a Team in between). The whole transaction rolled back.
    mockScheduleAtomic.mockResolvedValueOnce({
      outcome: "owned_accounts_block",
      accountId: ACCOUNT_ID,
      deletionStatus: "active",
      deletionRequestedAt: null,
      purgeAfter: null,
    });
    mockListOwnedTeamOrg
      .mockResolvedValueOnce([]) // pre-check: clear
      .mockResolvedValueOnce([{ id: "team-9", name: "Late Team", type: "team" }]); // refusal detail

    const err = await request().catch((e) => e);
    expect(err).toBeInstanceOf(OwnedAccountsBlockDeletionError);
    expect((err as OwnedAccountsBlockDeletionError).ownedAccounts).toEqual([
      { id: "team-9", name: "Late Team", type: "team" },
    ]);
    // The transaction rolled back, so no billing action followed either.
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });
});

describe("durable transition failure", () => {
  it("propagates the error and never leaves a standalone consumption behind", async () => {
    mockScheduleAtomic.mockRejectedValueOnce(new Error("deadlock detected"));

    await expect(request()).rejects.toThrow(/deadlock detected/);

    // The consumption lived inside the failed transaction, so it rolled back with
    // it. The service has no other way to have spent the code.
    expectNoChallengeMutation();
    // And no billing action ran on a transition that did not commit.
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });

  it("never reports a scheduled deletion when the transaction did not commit", async () => {
    mockScheduleAtomic.mockRejectedValueOnce(new Error("write failed"));
    const result = await request().then(
      () => "resolved",
      () => "rejected",
    );
    // The caller cannot mistake a failed transaction for a scheduled deletion.
    expect(result).toBe("rejected");
  });
});

describe("no authorization at spend time", () => {
  it("throws the typed VERIFICATION_REQUIRED refusal and schedules nothing", async () => {
    mockScheduleAtomic.mockResolvedValueOnce({
      outcome: "no_authorization",
      accountId: null,
      deletionStatus: null,
      deletionRequestedAt: null,
      purgeAfter: null,
    });

    const err = await request().catch((e) => e);
    expect(err).toBeInstanceOf(DeletionAuthorizationRequiredError);
    expect((err as DeletionAuthorizationRequiredError).code).toBe("VERIFICATION_REQUIRED");
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });
});

describe("concurrency: only one transition", () => {
  it("the loser of the race gets the EXISTING state, spends nothing, and writes nothing", async () => {
    // The transaction's FOR UPDATE lock serialized the two submissions; by the time
    // this one ran, the account was already pending.
    mockScheduleAtomic.mockResolvedValueOnce({
      outcome: "already_pending",
      accountId: ACCOUNT_ID,
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "2026-07-24T11:59:59.000Z",
      purgeAfter: "2026-08-23T11:59:59.000Z",
    });

    const state = await request();

    expect(state.deletionStatus).toBe("pending_deletion");
    // It reports the FIRST submission's timestamps — not a second transition.
    expect(state.deletionRequestedAt).toBe("2026-07-24T11:59:59.000Z");
    expect(state.purgeAfter).toBe("2026-08-23T11:59:59.000Z");
    expect(mockScheduleAtomic).toHaveBeenCalledTimes(1);
    expectNoChallengeMutation();
  });

  it("two concurrent submissions produce exactly ONE scheduled transition", async () => {
    // Model the DB: the first caller into the RPC schedules; every later caller
    // observes `already_pending` (the row lock guarantees this ordering).
    let scheduledCount = 0;
    mockScheduleAtomic.mockImplementation(async (input) => {
      if (scheduledCount === 0) {
        scheduledCount += 1;
        return scheduledOutcome(input);
      }
      return {
        outcome: "already_pending",
        accountId: input.accountId,
        deletionStatus: "pending_deletion",
        deletionRequestedAt: input.requestedAt,
        purgeAfter: input.purgeAfter,
      };
    });

    const [a, b] = await Promise.all([request(), request()]);

    expect(scheduledCount).toBe(1);
    expect(a.deletionStatus).toBe("pending_deletion");
    expect(b.deletionStatus).toBe("pending_deletion");
    expectNoChallengeMutation();
  });

  it("a REPLAY after success cannot create a second transition", async () => {
    let scheduledCount = 0;
    mockScheduleAtomic.mockImplementation(async (input) => {
      if (scheduledCount === 0) {
        scheduledCount += 1;
        return scheduledOutcome(input);
      }
      // The replay carries a spent challenge → the transaction finds nothing.
      return {
        outcome: "no_authorization",
        accountId: null,
        deletionStatus: null,
        deletionRequestedAt: null,
        purgeAfter: null,
      };
    });

    await request();
    await expect(request()).rejects.toBeInstanceOf(DeletionAuthorizationRequiredError);
    expect(scheduledCount).toBe(1);
  });
});

describe("already-pending accounts never spend an authorization", () => {
  it("the idempotent retry path performs no transition and consumes nothing", async () => {
    mockGetByIdServiceRole.mockResolvedValue(
      account({
        deletionStatus: "pending_deletion",
        deletionRequestedAt: "t",
        purgeAfter: "t2",
      }),
    );

    const state = await request();

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockScheduleAtomic).not.toHaveBeenCalled();
    expectNoChallengeMutation();
    // The billing retry still runs — that is the whole point of this branch.
    expect(mockCancelForDeletion).toHaveBeenCalledWith(ACCOUNT_ID);
  });
});

describe("billing failure keeps challenge/account state consistent", () => {
  it("reports a failed cancellation while the transition stays committed", async () => {
    mockCancelForDeletion.mockResolvedValue({ ok: false, reason: "stripe_unavailable" });

    const state = await request();

    // The freeze committed (durable), the cancellation did not — reported honestly.
    expect(state.deletionStatus).toBe("pending_deletion");
    expect(state.billingCancellation).toEqual({
      status: "failed",
      reason: "stripe_unavailable",
    });
    // Billing ran AFTER the transaction, and did not reach back into it.
    expect(mockScheduleAtomic).toHaveBeenCalledTimes(1);
    expectNoChallengeMutation();
  });

  it("a THROWN Stripe error still leaves a committed transition, not a rollback", async () => {
    mockCancelForDeletion.mockRejectedValue(new Error("stripe exploded"));

    const state = await request();

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(state.billingCancellation?.status).toBe("failed");
  });

  it("billing runs only AFTER the durable transition committed", async () => {
    const order: string[] = [];
    mockScheduleAtomic.mockImplementation(async (input) => {
      order.push("transaction");
      return scheduledOutcome(input);
    });
    mockCancelForDeletion.mockImplementation(async () => {
      order.push("billing");
      return { ok: true, outcome: "canceled" };
    });

    await request();
    expect(order).toEqual(["transaction", "billing"]);
  });
});

describe("system / admin callers", () => {
  it("may schedule with NO authorization at all (challenge: null)", async () => {
    await requestAccountDeletion({
      accountId: ACCOUNT_ID,
      requestedByUserId: null,
      now: NOW,
    });
    expect(mockScheduleAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ challenge: null }),
    );
  });
});
