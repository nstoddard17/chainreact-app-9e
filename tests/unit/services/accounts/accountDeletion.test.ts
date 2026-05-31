/**
 * @jest-environment node
 *
 * Unit tests for the account deletion lifecycle service (4.ACCOUNT-MODEL-10b).
 * Mocks the accounts + accountDeletions repos so no DB is touched. Proves the
 * request → pending_deletion freeze, cancel → active restore, idempotency on
 * both transitions, and the grace-window deadline math.
 */

const mockGetDeletionStatus = jest.fn();
const mockGetByIdServiceRole = jest.fn();
const mockSetDeletionPending = jest.fn();
const mockClearDeletion = jest.fn();

const mockInsertPending = jest.fn();
const mockMarkPendingCancelled = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
  setDeletionPendingServiceRole: (...a: unknown[]) => mockSetDeletionPending(...a),
  clearDeletionServiceRole: (...a: unknown[]) => mockClearDeletion(...a),
}));

jest.mock("@/repositories/accountDeletions", () => ({
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  markPendingCancelled: (...a: unknown[]) => mockMarkPendingCancelled(...a),
}));

import {
  DEFAULT_GRACE_PERIOD_DAYS,
  requestAccountDeletion,
  cancelAccountDeletion,
} from "@/services/accounts/accountDeletion";

const ACCOUNT_ID = "acct-1";
const OWNER_ID = "user-1";

function pendingAccountRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: OWNER_ID,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: "2026-05-31T00:00:00.000Z",
    purgeAfter: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

function activeAccountRecord(overrides: Record<string, unknown> = {}) {
  return pendingAccountRecord({
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetDeletionStatus.mockReset();
  mockGetByIdServiceRole.mockReset();
  mockSetDeletionPending.mockReset();
  mockClearDeletion.mockReset();
  mockInsertPending.mockReset();
  mockMarkPendingCancelled.mockReset();
});

describe("requestAccountDeletion", () => {
  it("freezes an active account and writes a pending audit row with the grace deadline", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("active");
    mockSetDeletionPending.mockResolvedValueOnce(pendingAccountRecord());
    mockInsertPending.mockResolvedValueOnce({});

    const now = new Date("2026-05-31T00:00:00.000Z");
    const state = await requestAccountDeletion({
      accountId: ACCOUNT_ID,
      requestedByUserId: OWNER_ID,
      now,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    // 30-day default grace.
    const expectedPurge = new Date(
      now.getTime() + DEFAULT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(mockSetDeletionPending).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      requestedByUserId: OWNER_ID,
      requestedAt: now.toISOString(),
      purgeAfter: expectedPurge,
    });
    expect(mockInsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        ownerUserId: OWNER_ID,
        purgeAfter: expectedPurge,
      }),
    );
  });

  it("is idempotent: requesting an already-pending account does not write again", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("pending_deletion");
    mockGetByIdServiceRole.mockResolvedValueOnce(pendingAccountRecord());

    const state = await requestAccountDeletion({
      accountId: ACCOUNT_ID,
      requestedByUserId: OWNER_ID,
    });

    expect(state.deletionStatus).toBe("pending_deletion");
    expect(mockSetDeletionPending).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("honors a custom grace period", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("active");
    mockSetDeletionPending.mockResolvedValueOnce(pendingAccountRecord());
    mockInsertPending.mockResolvedValueOnce({});

    const now = new Date("2026-05-31T00:00:00.000Z");
    await requestAccountDeletion({
      accountId: ACCOUNT_ID,
      requestedByUserId: OWNER_ID,
      gracePeriodDays: 7,
      now,
    });

    const expectedPurge = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(mockSetDeletionPending).toHaveBeenCalledWith(
      expect.objectContaining({ purgeAfter: expectedPurge }),
    );
  });

  it("throws when the account does not exist", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(null);
    await expect(
      requestAccountDeletion({ accountId: "missing", requestedByUserId: OWNER_ID }),
    ).rejects.toThrow(/not found/);
  });
});

describe("cancelAccountDeletion", () => {
  it("restores a pending account to active and settles the audit row", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("pending_deletion");
    mockClearDeletion.mockResolvedValueOnce(activeAccountRecord());
    mockMarkPendingCancelled.mockResolvedValueOnce(undefined);

    const now = new Date("2026-06-05T00:00:00.000Z");
    const state = await cancelAccountDeletion({ accountId: ACCOUNT_ID, now });

    expect(state.deletionStatus).toBe("active");
    expect(state.purgeAfter).toBeNull();
    expect(mockClearDeletion).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mockMarkPendingCancelled).toHaveBeenCalledWith(
      ACCOUNT_ID,
      now.toISOString(),
    );
  });

  it("is idempotent: cancelling an already-active account does not write", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("active");
    mockGetByIdServiceRole.mockResolvedValueOnce(activeAccountRecord());

    const state = await cancelAccountDeletion({ accountId: ACCOUNT_ID });

    expect(state.deletionStatus).toBe("active");
    expect(mockClearDeletion).not.toHaveBeenCalled();
    expect(mockMarkPendingCancelled).not.toHaveBeenCalled();
  });

  it("throws when the account does not exist", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce(null);
    await expect(
      cancelAccountDeletion({ accountId: "missing" }),
    ).rejects.toThrow(/not found/);
  });
});
