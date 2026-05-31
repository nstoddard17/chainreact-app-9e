/**
 * @jest-environment node
 *
 * Unit tests for executionBillingGate (Slice 1N + COST-2A + 4.ACCOUNT-MODEL-10b).
 * Mocks the accountBilling repository + the account freeze guard so no DB is
 * touched.
 */

const mockDeductTasks = jest.fn();
const mockIsAccountFrozen = jest.fn();

jest.mock("@/repositories/accountBilling", () => ({
  deductTasks: (...args: unknown[]) => mockDeductTasks(...args),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

import { executionBillingGate } from "@/services/billing/executionBillingGate";

beforeEach(() => {
  mockDeductTasks.mockReset();
  mockIsAccountFrozen.mockReset();
  // Default: account operational. Individual tests override.
  mockIsAccountFrozen.mockResolvedValue(false);
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
});
