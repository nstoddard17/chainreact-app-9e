/**
 * @jest-environment node
 *
 * Unit tests for the account freeze guard (4.ACCOUNT-MODEL-10b). Mocks the
 * accounts repo so no DB is touched.
 */

const mockGetDeletionStatusServiceRole = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...args: unknown[]) =>
    mockGetDeletionStatusServiceRole(...args),
}));

import {
  AccountFrozenError,
  assertAccountOperational,
  isAccountFrozen,
} from "@/services/accounts/accountFreeze";

beforeEach(() => {
  mockGetDeletionStatusServiceRole.mockReset();
});

describe("accountFreeze", () => {
  it("isAccountFrozen is true for a pending_deletion account", async () => {
    mockGetDeletionStatusServiceRole.mockResolvedValueOnce("pending_deletion");
    expect(await isAccountFrozen("acct-1")).toBe(true);
  });

  it("isAccountFrozen is false for an active account", async () => {
    mockGetDeletionStatusServiceRole.mockResolvedValueOnce("active");
    expect(await isAccountFrozen("acct-1")).toBe(false);
  });

  it("isAccountFrozen is false for a missing account (status null)", async () => {
    mockGetDeletionStatusServiceRole.mockResolvedValueOnce(null);
    expect(await isAccountFrozen("acct-1")).toBe(false);
  });

  it("assertAccountOperational throws AccountFrozenError when frozen", async () => {
    mockGetDeletionStatusServiceRole.mockResolvedValueOnce("pending_deletion");
    await expect(assertAccountOperational("acct-frozen")).rejects.toBeInstanceOf(
      AccountFrozenError,
    );
  });

  it("assertAccountOperational resolves for an active account", async () => {
    mockGetDeletionStatusServiceRole.mockResolvedValueOnce("active");
    await expect(assertAccountOperational("acct-1")).resolves.toBeUndefined();
  });

  it("AccountFrozenError carries the accountId and a stable code", async () => {
    const err = new AccountFrozenError("acct-9");
    expect(err.code).toBe("ACCOUNT_FROZEN");
    expect(err.accountId).toBe("acct-9");
  });
});
