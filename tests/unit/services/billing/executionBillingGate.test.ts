/**
 * @jest-environment node
 *
 * Unit tests for executionBillingGate (Slice 1N + COST-2A + 4.ACCOUNT-MODEL-10b).
 * Mocks the accountBilling repository + the account freeze guard so no DB is
 * touched.
 */

const mockDeductTasks = jest.fn();
const mockIsAccountFrozen = jest.fn();
const mockGetBillingMode = jest.fn();

jest.mock("@/repositories/accountBilling", () => ({
  deductTasks: (...args: unknown[]) => mockDeductTasks(...args),
  getBillingModeServiceRole: (...args: unknown[]) => mockGetBillingMode(...args),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

import { executionBillingGate } from "@/services/billing/executionBillingGate";

beforeEach(() => {
  mockDeductTasks.mockReset();
  mockIsAccountFrozen.mockReset();
  mockGetBillingMode.mockReset();
  // Default: account operational, standard billing. Individual tests override.
  mockIsAccountFrozen.mockResolvedValue(false);
  mockGetBillingMode.mockResolvedValue("standard");
});

describe("executionBillingGate", () => {
  it("returns ok with usage when a task is deducted", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: true, used: 5, limit: 100 });
    const outcome = await executionBillingGate("acct-1");
    expect(outcome).toEqual({ ok: true, used: 5, limit: 100 });
  });

  it("skips deduction in test mode without touching the repo", async () => {
    const testOutcome = await executionBillingGate("acct-1", { testMode: true });
    expect(testOutcome).toEqual({ ok: true, skipped: true, reason: "test_mode" });
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("returns limit_reached when the deduction is refused", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: false, used: 100, limit: 100 });
    const outcome = await executionBillingGate("acct-1");
    expect(outcome).toEqual({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });
  });

  it("refuses a frozen (pending_deletion) account before any deduction", async () => {
    mockIsAccountFrozen.mockResolvedValueOnce(true);
    const outcome = await executionBillingGate("acct-frozen");
    expect(outcome).toEqual({
      ok: false,
      reason: "account_frozen",
      used: 0,
      limit: 0,
    });
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("refuses a frozen account even for a test-mode run (freeze beats test-mode skip)", async () => {
    mockIsAccountFrozen.mockResolvedValueOnce(true);
    const outcome = await executionBillingGate("acct-frozen", { testMode: true });
    expect(outcome).toEqual({
      ok: false,
      reason: "account_frozen",
      used: 0,
      limit: 0,
    });
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  // ── BIE-1: internal-free accounts bypass deduction ─────────────────────────

  it("internal_free account runs without deduction, even when quota is exhausted", async () => {
    mockGetBillingMode.mockResolvedValueOnce("internal_free");
    // Quota would be exhausted if it were ever consulted.
    mockDeductTasks.mockResolvedValue({ ok: false, used: 100, limit: 100 });
    const outcome = await executionBillingGate("acct-internal");
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "internal_free" });
    // The deduction RPC is never called for an internal-free account.
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("standard account is still deducted and still blocks when exhausted", async () => {
    mockGetBillingMode.mockResolvedValue("standard");
    mockDeductTasks.mockResolvedValueOnce({ ok: false, used: 100, limit: 100 });
    const outcome = await executionBillingGate("acct-standard");
    expect(outcome).toEqual({ ok: false, reason: "limit_reached", used: 100, limit: 100 });
    expect(mockDeductTasks).toHaveBeenCalledWith("acct-standard", 1);
  });

  it("is account-scoped: the billing mode is read for the exact account being billed", async () => {
    mockGetBillingMode.mockResolvedValue("standard");
    mockDeductTasks.mockResolvedValueOnce({ ok: true, used: 1, limit: 100 });
    await executionBillingGate("acct-XYZ");
    // The entitlement read is keyed on the workflow-owning account id, never a user id.
    expect(mockGetBillingMode).toHaveBeenCalledWith("acct-XYZ");
    expect(mockDeductTasks).toHaveBeenCalledWith("acct-XYZ", 1);
  });

  it("a frozen internal_free account is still refused (freeze beats internal bypass)", async () => {
    mockIsAccountFrozen.mockResolvedValueOnce(true);
    mockGetBillingMode.mockResolvedValue("internal_free");
    const outcome = await executionBillingGate("acct-internal-frozen");
    expect(outcome).toEqual({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    // Freeze short-circuits before the billing-mode read or deduction.
    expect(mockGetBillingMode).not.toHaveBeenCalled();
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("test mode skips before the billing-mode read (no entitlement round trip)", async () => {
    const outcome = await executionBillingGate("acct-1", { testMode: true });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "test_mode" });
    expect(mockGetBillingMode).not.toHaveBeenCalled();
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });
});
