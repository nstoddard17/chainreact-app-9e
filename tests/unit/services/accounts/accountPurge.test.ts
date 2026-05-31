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

const mockRevokeProviderToken = jest.fn();
const mockDecryptToken = jest.fn();

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
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  revokeProviderToken: (...a: unknown[]) => mockRevokeProviderToken(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));

import {
  purgeAccount,
  purgeDuePendingAccounts,
} from "@/services/accounts/accountPurge";

const ACCOUNT_ID = "acct-1";
const OWNER_ID = "user-1";
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
  ]) m.mockReset();

  // Sensible defaults for the happy path.
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
    // Ordering: integrations (revoke→delete) → runs → workflows → billing →
    // account → auth.users → audit. auth.users is strictly after account.
    expect(calls).toEqual([
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
    expect(calls.indexOf("deleteAuthUser")).toBeGreaterThan(calls.indexOf("deleteAccount"));
    expect(mockDeleteAuthUser).toHaveBeenCalledWith(OWNER_ID);

    if (r.status === "purged") {
      expect(r.counts).toMatchObject({
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
    // No teardown of operational tables (account already gone).
    expect(mockDeleteWorkflows).not.toHaveBeenCalled();
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
