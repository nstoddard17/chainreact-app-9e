/**
 * @jest-environment node
 *
 * Unit tests for the account purge service (4.ACCOUNT-MODEL-10c). Mocks the
 * repos + token revoke so no DB / provider is touched. Proves:
 *   - eligibility guard (never purges active or still-in-grace accounts)
 *   - RESTRICT-safe teardown order with auth.users LAST
 *   - token revoke failure does NOT block deletion (row still deleted)
 *   - audit row marked purged with counts
 *   - interrupted-purge recovery via the pending audit row
 *   - per-account isolation in the due-sweep
 */

const mockGetByIdServiceRole = jest.fn();
const mockMarkPurged = jest.fn();
const mockGetPendingOwner = jest.fn();

const mockListIntegrations = jest.fn();
const mockDeleteIntegration = jest.fn();
const mockDeleteRuns = jest.fn();
const mockDeleteWorkflows = jest.fn();
const mockDeleteBilling = jest.fn();
const mockDeleteAccount = jest.fn();
const mockDeleteAuthUser = jest.fn();
const mockListDue = jest.fn();
const mockListPending = jest.fn();
const mockCancelForDeletion = jest.fn();
const mockHasRenewable = jest.fn();

const mockRevokeProviderToken = jest.fn();
const mockDecryptToken = jest.fn();
const mockAnonymizeLedgers = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
}));
jest.mock("@/repositories/accountDeletions", () => ({
  markPurged: (...a: unknown[]) => mockMarkPurged(...a),
  getPendingOwnerForOrphanedAccount: (...a: unknown[]) => mockGetPendingOwner(...a),
}));
jest.mock("@/repositories/accountPurge", () => ({
  listIntegrationsForPurge: (...a: unknown[]) => mockListIntegrations(...a),
  deleteIntegration: (...a: unknown[]) => mockDeleteIntegration(...a),
  deleteWorkflowRunsByAccount: (...a: unknown[]) => mockDeleteRuns(...a),
  deleteWorkflowsByAccount: (...a: unknown[]) => mockDeleteWorkflows(...a),
  deleteAccountBilling: (...a: unknown[]) => mockDeleteBilling(...a),
  deleteAccount: (...a: unknown[]) => mockDeleteAccount(...a),
  deleteAuthUser: (...a: unknown[]) => mockDeleteAuthUser(...a),
  listDuePendingAccounts: (...a: unknown[]) => mockListDue(...a),
  listPendingDeletionAccounts: (...a: unknown[]) => mockListPending(...a),
}));

// ACCOUNT-BILLING-LIFECYCLE-1 — purge fail-closed guard + billing reconciliation sweep.
jest.mock("@/services/billing/subscriptionCancellation", () => ({
  cancelSubscriptionForAccountDeletion: (...a: unknown[]) => mockCancelForDeletion(...a),
  accountHasRenewableSubscription: (...a: unknown[]) => mockHasRenewable(...a),
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  revokeProviderToken: (...a: unknown[]) => mockRevokeProviderToken(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));
jest.mock("@/repositories/ledgerAnonymization", () => ({
  anonymizeAccountLedgers: (...a: unknown[]) => mockAnonymizeLedgers(...a),
}));

import {
  purgeAccount,
  purgeDuePendingAccounts,
  reconcilePendingDeletionBilling,
} from "@/services/accounts/accountPurge";

const ACCOUNT_ID = "acct-1";
const OWNER_ID = "user-1";

/** Invocation order of a mock's FIRST call — fails loudly if it was never called. */
function firstCallOrder(m: jest.Mock): number {
  const order = m.mock.invocationCallOrder[0];
  if (order === undefined) throw new Error("expected the mock to have been called");
  return order;
}
const PAST = "2026-05-01T00:00:00.000Z";
const NOW = new Date("2026-07-01T00:00:00.000Z");

function pendingDueAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: OWNER_ID,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: PAST,
    purgeAfter: PAST, // already elapsed vs NOW
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: PAST,
    ...overrides,
  };
}

beforeEach(() => {
  for (const m of [
    mockGetByIdServiceRole, mockMarkPurged, mockGetPendingOwner,
    mockListIntegrations, mockDeleteIntegration, mockDeleteRuns,
    mockDeleteWorkflows, mockDeleteBilling, mockDeleteAccount,
    mockDeleteAuthUser, mockListDue, mockRevokeProviderToken, mockDecryptToken,
    mockAnonymizeLedgers, mockListPending, mockCancelForDeletion, mockHasRenewable,
  ]) m.mockReset();

  // ACCOUNT-BILLING-LIFECYCLE-1 defaults: the retry-then-verify billing guard finds nothing
  // renewable (the deletion request already cancelled), so the happy path proceeds.
  mockCancelForDeletion.mockResolvedValue({ ok: true, outcome: "not_applicable" });
  mockHasRenewable.mockResolvedValue({ ok: true, renewable: false });
  mockListPending.mockResolvedValue([]);

  // Sensible defaults for the happy path.
  mockAnonymizeLedgers.mockResolvedValue({
    taskUsageEvents: 0, aiCostEvents: 0, billingShadowComparisons: 0, total: 0,
  });
  mockListIntegrations.mockResolvedValue([]);
  mockDeleteRuns.mockResolvedValue(0);
  mockDeleteWorkflows.mockResolvedValue(0);
  mockDeleteBilling.mockResolvedValue(undefined);
  mockDeleteAccount.mockResolvedValue(undefined);
  mockDeleteAuthUser.mockResolvedValue(undefined);
  mockMarkPurged.mockResolvedValue(undefined);
  mockDecryptToken.mockImplementation((enc: string) => `plain-${enc}`);
  mockRevokeProviderToken.mockResolvedValue(undefined);
});

describe("purgeAccount — eligibility guard", () => {
  it("skips an active account (never purges a non-pending account)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(
      pendingDueAccount({ deletionStatus: "active", purgeAfter: null }),
    );
    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });
    expect(r).toEqual({ status: "skipped", reason: "not_pending_deletion" });
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
  });

  it("skips a pending account whose grace window has NOT elapsed", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(
      pendingDueAccount({ purgeAfter: "2026-08-01T00:00:00.000Z" }), // after NOW
    );
    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });
    expect(r).toEqual({ status: "skipped", reason: "grace_not_elapsed" });
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
  });
});

describe("purgeAccount — teardown", () => {
  it("deletes in RESTRICT-safe order with auth.users LAST and marks audit purged", async () => {
    const calls: string[] = [];
    mockAnonymizeLedgers.mockImplementationOnce(async () => {
      calls.push("anonymizeLedgers");
      return { taskUsageEvents: 4, aiCostEvents: 2, billingShadowComparisons: 1, total: 7 };
    });
    mockListIntegrations.mockImplementationOnce(async () => {
      calls.push("listIntegrations");
      return [
        { id: "int-1", provider: "slack", accessTokenEncrypted: "ENC1", refreshTokenEncrypted: null },
      ];
    });
    mockRevokeProviderToken.mockImplementationOnce(async () => { calls.push("revoke"); });
    mockDeleteIntegration.mockImplementationOnce(async () => { calls.push("deleteIntegration"); });
    mockDeleteRuns.mockImplementationOnce(async () => { calls.push("deleteRuns"); return 2; });
    mockDeleteWorkflows.mockImplementationOnce(async () => { calls.push("deleteWorkflows"); return 3; });
    mockDeleteBilling.mockImplementationOnce(async () => { calls.push("deleteBilling"); });
    mockDeleteAccount.mockImplementationOnce(async () => { calls.push("deleteAccount"); });
    mockDeleteAuthUser.mockImplementationOnce(async () => { calls.push("deleteAuthUser"); });
    mockMarkPurged.mockImplementationOnce(async () => { calls.push("markPurged"); });
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r.status).toBe("purged");
    // Ordering: anonymize ledgers FIRST → integrations (revoke→delete) → runs →
    // workflows → billing → account → auth.users → audit. Anonymization MUST
    // precede every delete (4.ACCOUNT-MODEL-10d); auth.users strictly after account.
    expect(calls).toEqual([
      "anonymizeLedgers",
      "listIntegrations",
      "revoke",
      "deleteIntegration",
      "deleteRuns",
      "deleteWorkflows",
      "deleteBilling",
      "deleteAccount",
      "deleteAuthUser",
      "markPurged",
    ]);
    expect(calls.indexOf("anonymizeLedgers")).toBe(0);
    expect(calls.indexOf("anonymizeLedgers")).toBeLessThan(calls.indexOf("deleteRuns"));
    expect(calls.indexOf("deleteAuthUser")).toBeGreaterThan(calls.indexOf("deleteAccount"));
    expect(mockDeleteAuthUser).toHaveBeenCalledWith(OWNER_ID);
    // Anonymization stamps a 90-day retention deadline relative to `now`.
    expect(mockAnonymizeLedgers).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        anonymizedAt: NOW.toISOString(),
        ledgerPurgeAfter: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    if (r.status === "purged") {
      expect(r.counts).toMatchObject({
        ledgerRowsAnonymized: 7,
        integrationsRevoked: 1,
        integrationsRevokeFailed: 0,
        integrationsDeleted: 1,
        workflowRunsDeleted: 2,
        workflowsDeleted: 3,
        billingDeleted: true,
        accountDeleted: true,
        authUserDeleted: true,
      });
    }
  });

  it("does NOT anonymize ledgers when the account is not eligible (guard precedes anonymize)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(
      pendingDueAccount({ purgeAfter: "2026-08-01T00:00:00.000Z" }),
    );
    await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });
    expect(mockAnonymizeLedgers).not.toHaveBeenCalled();
  });

  it("token revoke failure does NOT block purge — the row is still deleted", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    mockListIntegrations.mockResolvedValueOnce([
      { id: "int-1", provider: "slack", accessTokenEncrypted: "ENC1", refreshTokenEncrypted: null },
    ]);
    mockRevokeProviderToken.mockRejectedValue(new Error("provider 503")); // every attempt fails

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r.status).toBe("purged");
    expect(mockDeleteIntegration).toHaveBeenCalledWith("int-1");
    expect(mockDeleteAuthUser).toHaveBeenCalledWith(OWNER_ID);
    if (r.status === "purged") {
      expect(r.counts.integrationsRevoked).toBe(0);
      expect(r.counts.integrationsRevokeFailed).toBe(1);
      expect(r.counts.integrationsDeleted).toBe(1);
    }
    // Bounded retry: 3 attempts then give up.
    expect(mockRevokeProviderToken).toHaveBeenCalledTimes(3);
  });

  it("a token that cannot be decrypted counts as revoke-failed but still deletes the row", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    mockListIntegrations.mockResolvedValueOnce([
      { id: "int-1", provider: "slack", accessTokenEncrypted: "BAD", refreshTokenEncrypted: null },
    ]);
    mockDecryptToken.mockImplementationOnce(() => { throw new Error("decrypt failed"); });

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r.status).toBe("purged");
    expect(mockRevokeProviderToken).not.toHaveBeenCalled(); // never reached provider
    expect(mockDeleteIntegration).toHaveBeenCalledWith("int-1");
    if (r.status === "purged") expect(r.counts.integrationsRevokeFailed).toBe(1);
  });
});

describe("purgeAccount — recovery + missing", () => {
  it("recovers an interrupted purge: account gone but a pending audit row remains", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    mockGetPendingOwner.mockResolvedValueOnce(OWNER_ID);

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r).toEqual({ status: "recovered", accountId: ACCOUNT_ID });
    expect(mockDeleteAuthUser).toHaveBeenCalledWith(OWNER_ID);
    expect(mockMarkPurged).toHaveBeenCalled();
    // No teardown of operational tables (account already gone). Ledgers were
    // anonymized before the account was deleted in the original (interrupted)
    // run, so recovery does NOT re-anonymize.
    expect(mockDeleteWorkflows).not.toHaveBeenCalled();
    expect(mockAnonymizeLedgers).not.toHaveBeenCalled();
  });

  it("skips when the account is gone and there is no pending audit row", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    mockGetPendingOwner.mockResolvedValueOnce(null);

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r).toEqual({ status: "skipped", reason: "account_not_found" });
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
  });
});

describe("purgeDuePendingAccounts — sweep", () => {
  it("purges every due account and isolates per-account failures", async () => {
    mockListDue.mockResolvedValueOnce([
      { accountId: "a1", ownerUserId: "u1" },
      { accountId: "a2", ownerUserId: "u2" },
      { accountId: "a3", ownerUserId: "u3" },
    ]);
    // a1 purges, a2 throws (isolated), a3 purges.
    mockGetByIdServiceRole
      .mockResolvedValueOnce(pendingDueAccount({ id: "a1", ownerUserId: "u1" }))
      .mockResolvedValueOnce(pendingDueAccount({ id: "a2", ownerUserId: "u2" }))
      .mockResolvedValueOnce(pendingDueAccount({ id: "a3", ownerUserId: "u3" }));
    mockDeleteAccount
      .mockResolvedValueOnce(undefined) // a1
      .mockRejectedValueOnce(new Error("transient")) // a2
      .mockResolvedValueOnce(undefined); // a3

    const r = await purgeDuePendingAccounts(NOW);

    expect(r.scanned).toBe(3);
    expect(r.purged).toBe(2);
    expect(r.failed).toBe(1);
  });

  it("returns a zeroed summary when nothing is due", async () => {
    mockListDue.mockResolvedValueOnce([]);
    const r = await purgeDuePendingAccounts(NOW);
    expect(r).toEqual({ scanned: 0, purged: 0, recovered: 0, skipped: 0, failed: 0 });
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-1 — the purge must FAIL CLOSED while the account can still be
 * billed. Purge destroys `account_billing` (and with it `stripe_subscription_id`), so
 * proceeding while a subscription is live would leave a customer charged with no handle for
 * us to find it. These prove no destructive step runs in that case.
 */
describe("purgeAccount — billing fail-closed guard", () => {
  /** Assert that NOTHING destructive ran. */
  function expectNoTeardown() {
    expect(mockAnonymizeLedgers).not.toHaveBeenCalled();
    expect(mockDeleteIntegration).not.toHaveBeenCalled();
    expect(mockDeleteWorkflows).not.toHaveBeenCalled();
    expect(mockDeleteRuns).not.toHaveBeenCalled();
    expect(mockDeleteBilling).not.toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
    expect(mockMarkPurged).not.toHaveBeenCalled();
  }

  it("RETRIES the cancellation before checking (idempotent recovery)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });
    expect(mockCancelForDeletion).toHaveBeenCalledWith(ACCOUNT_ID);
    // Retry BEFORE the verification read.
    expect(firstCallOrder(mockCancelForDeletion)).toBeLessThan(
      firstCallOrder(mockHasRenewable),
    );
  });

  it("SKIPS the purge when a live subscription remains — no data is destroyed", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    mockHasRenewable.mockResolvedValue({ ok: true, renewable: true });

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r).toEqual({ status: "skipped", reason: "renewable_subscription" });
    expectNoTeardown();
  });

  it("SKIPS the purge when the subscription state cannot be VERIFIED", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    mockHasRenewable.mockResolvedValue({ ok: false, reason: "unverifiable" });

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    // "We couldn't check" is never treated as "it's safe".
    expect(r).toEqual({ status: "skipped", reason: "renewable_subscription" });
    expectNoTeardown();
  });

  it("proceeds normally once no renewable subscription remains", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingDueAccount());
    mockHasRenewable.mockResolvedValue({ ok: true, renewable: false });

    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });

    expect(r.status).toBe("purged");
    expect(mockDeleteAccount).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mockDeleteAuthUser).toHaveBeenCalledWith(OWNER_ID);
  });

  it("does not touch billing for an account that is not eligible in the first place", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(
      pendingDueAccount({ deletionStatus: "active" }),
    );
    const r = await purgeAccount({ accountId: ACCOUNT_ID, now: NOW });
    expect(r).toEqual({ status: "skipped", reason: "not_pending_deletion" });
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
    expect(mockHasRenewable).not.toHaveBeenCalled();
  });

  it("counts a fail-closed skip as SKIPPED (not failed) in the sweep", async () => {
    mockListDue.mockResolvedValueOnce([{ accountId: "a1", ownerUserId: "u1" }]);
    mockGetByIdServiceRole.mockResolvedValueOnce(
      pendingDueAccount({ id: "a1", ownerUserId: "u1" }),
    );
    mockHasRenewable.mockResolvedValue({ ok: true, renewable: true });

    const r = await purgeDuePendingAccounts(NOW);
    expect(r).toMatchObject({ scanned: 1, purged: 0, skipped: 1, failed: 0 });
  });
});

/**
 * The DURABLE retry for "the account was frozen but Stripe was unreachable". Its worklist is
 * re-derived from `pending_deletion` state every tick — nothing is held in memory.
 */
describe("reconcilePendingDeletionBilling", () => {
  it("cancels for every pending-deletion account and reports the outcome mix", async () => {
    mockListPending.mockResolvedValue(["a1", "a2", "a3"]);
    mockCancelForDeletion
      .mockResolvedValueOnce({ ok: true, outcome: "canceled" })
      .mockResolvedValueOnce({ ok: true, outcome: "not_applicable" })
      .mockResolvedValueOnce({ ok: false, reason: "stripe_unavailable" });

    const r = await reconcilePendingDeletionBilling();

    expect(r).toEqual({ scanned: 3, canceled: 1, alreadyClear: 1, failed: 1 });
    expect(mockCancelForDeletion).toHaveBeenCalledWith("a1");
    expect(mockCancelForDeletion).toHaveBeenCalledWith("a3");
  });

  it("ignores the grace window — billing stops NOW, not in 30 days", async () => {
    mockListPending.mockResolvedValue(["a1"]);
    await reconcilePendingDeletionBilling();
    // The worklist comes from the un-filtered pending list, never the due list.
    expect(mockListPending).toHaveBeenCalledWith();
    expect(mockListDue).not.toHaveBeenCalled();
  });

  it("isolates a per-account throw so one bad account never strands the rest", async () => {
    mockListPending.mockResolvedValue(["a1", "a2"]);
    mockCancelForDeletion
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, outcome: "canceled" });

    const r = await reconcilePendingDeletionBilling();
    expect(r).toEqual({ scanned: 2, canceled: 1, alreadyClear: 0, failed: 1 });
  });

  it("performs NO data teardown of any kind", async () => {
    mockListPending.mockResolvedValue(["a1"]);
    mockCancelForDeletion.mockResolvedValue({ ok: true, outcome: "canceled" });

    await reconcilePendingDeletionBilling();

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
    expect(mockAnonymizeLedgers).not.toHaveBeenCalled();
    expect(mockMarkPurged).not.toHaveBeenCalled();
  });

  it("returns a zeroed summary when no account is pending deletion", async () => {
    mockListPending.mockResolvedValue([]);
    expect(await reconcilePendingDeletionBilling()).toEqual({
      scanned: 0,
      canceled: 0,
      alreadyClear: 0,
      failed: 0,
    });
    expect(mockCancelForDeletion).not.toHaveBeenCalled();
  });
});
