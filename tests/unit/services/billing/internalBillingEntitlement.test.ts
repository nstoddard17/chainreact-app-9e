/**
 * @jest-environment node
 *
 * Slice 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1 — internal billing entitlement
 * admin service.
 *
 * Proves the admin-only service surface validates input and delegates to the
 * audited service-role repository writers — and never offers a user-level bypass.
 * The repository layer is mocked (its service-role boundary is covered in
 * accountBillingInternalEntitlement.test.ts); here we assert the service contract:
 * reason validation, required actor id, and correct delegation.
 */

const mockSetInternal = jest.fn();
const mockRevert = jest.fn();
const mockGetMode = jest.fn();

jest.mock("@/repositories/accountBilling", () => ({
  INTERNAL_BILLING_REASONS: ["employee", "qa", "demo", "load_test", "partner", "other"],
  setBillingModeInternalFreeServiceRole: (...a: unknown[]) => mockSetInternal(...a),
  revertBillingModeToStandardServiceRole: (...a: unknown[]) => mockRevert(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetMode(...a),
}));

import {
  markAccountInternalFree,
  revertAccountToStandardBilling,
  getAccountBillingMode,
  INTERNAL_BILLING_REASONS,
} from "@/services/billing/internalBillingEntitlement";

beforeEach(() => {
  mockSetInternal.mockReset();
  mockRevert.mockReset();
  mockGetMode.mockReset();
});

describe("markAccountInternalFree", () => {
  it("delegates a valid request to the audited service-role writer", async () => {
    await markAccountInternalFree({ accountId: "acct-1", reason: "qa", setByUserId: "user-7" });
    expect(mockSetInternal).toHaveBeenCalledWith("acct-1", "qa", "user-7");
  });

  it("accepts every documented reason", async () => {
    for (const reason of INTERNAL_BILLING_REASONS) {
      mockSetInternal.mockClear();
      await markAccountInternalFree({ accountId: "acct-1", reason, setByUserId: "user-1" });
      expect(mockSetInternal).toHaveBeenCalledWith("acct-1", reason, "user-1");
    }
  });

  it("rejects an unknown reason without touching the DB", async () => {
    await expect(
      // @ts-expect-error — deliberately invalid reason
      markAccountInternalFree({ accountId: "acct-1", reason: "free_lunch", setByUserId: "user-1" }),
    ).rejects.toThrow(/invalid reason/);
    expect(mockSetInternal).not.toHaveBeenCalled();
  });

  it("requires an actor id for audit (no anonymous internal flip)", async () => {
    await expect(
      markAccountInternalFree({ accountId: "acct-1", reason: "demo", setByUserId: "" }),
    ).rejects.toThrow(/setByUserId is required/);
    expect(mockSetInternal).not.toHaveBeenCalled();
  });

  it("requires an account id", async () => {
    await expect(
      markAccountInternalFree({ accountId: "", reason: "demo", setByUserId: "user-1" }),
    ).rejects.toThrow(/accountId is required/);
    expect(mockSetInternal).not.toHaveBeenCalled();
  });
});

describe("revertAccountToStandardBilling", () => {
  it("delegates to the service-role revert writer", async () => {
    await revertAccountToStandardBilling("acct-1");
    expect(mockRevert).toHaveBeenCalledWith("acct-1");
  });

  it("requires an account id", async () => {
    await expect(revertAccountToStandardBilling("")).rejects.toThrow(/accountId is required/);
    expect(mockRevert).not.toHaveBeenCalled();
  });
});

describe("getAccountBillingMode", () => {
  it("reads through the service-role repository", async () => {
    mockGetMode.mockResolvedValueOnce("internal_free");
    expect(await getAccountBillingMode("acct-1")).toBe("internal_free");
    expect(mockGetMode).toHaveBeenCalledWith("acct-1");
  });
});
