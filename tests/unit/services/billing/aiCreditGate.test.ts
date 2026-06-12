/**
 * @jest-environment node
 *
 * Unit tests for `aiCreditGate` (Slice 4.AI-CREDITS-3, deduct-only). Mocks the
 * accountBilling repo + the account-freeze guard + the enforcement flag so no DB
 * is touched; the real `computeAiCreditCharge` runs (genuine credit amounts).
 */

const mockDeductAiCredits = jest.fn();
jest.mock("@/repositories/accountBillingAiCredits", () => ({
  deductAiCredits: (...a: unknown[]) => mockDeductAiCredits(...a),
}));

const mockIsAccountFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...a: unknown[]) => mockIsAccountFrozen(...a),
}));

const mockFlag = jest.fn();
jest.mock("@/services/billing/billingFeatureFlags", () => ({
  isAiCreditEnforcementEnabled: () => mockFlag(),
}));

import { aiCreditGate } from "@/services/billing/aiCreditGate";

beforeEach(() => {
  mockDeductAiCredits.mockReset();
  mockIsAccountFrozen.mockReset();
  mockIsAccountFrozen.mockResolvedValue(false);
  mockFlag.mockReset();
  mockFlag.mockReturnValue(true); // default: enforcement ON (individual tests override)
});

describe("aiCreditGate — flag OFF", () => {
  it("is a pure no-op: no frozen check, no deduct, returns enforcement_disabled", async () => {
    mockFlag.mockReturnValue(false);
    const outcome = await aiCreditGate({ accountId: "a1", feature: "workflow_explanation" });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "enforcement_disabled" });
    expect(mockIsAccountFrozen).not.toHaveBeenCalled();
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });
});

describe("aiCreditGate — flag ON", () => {
  it("deducts the feature's credits for a paid feature (explanation fast = 1)", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 5, limit: 500 });
    const outcome = await aiCreditGate({
      accountId: "a1",
      feature: "workflow_explanation",
      plannedTier: "fast",
    });
    expect(mockDeductAiCredits).toHaveBeenCalledWith("a1", 1);
    expect(outcome).toEqual({ ok: true, charged: 1, used: 5, limit: 500 });
  });

  it("charges more at a stronger tier (repair strong = 8) — account attribution preserved", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 8, limit: 2000 });
    await aiCreditGate({ accountId: "team-acct", feature: "workflow_repair", plannedTier: "strong" });
    expect(mockDeductAiCredits).toHaveBeenCalledWith("team-acct", 8); // base 4 × strong 2
  });

  it("a 0-credit feature passes WITHOUT touching the ledger (zero_credit)", async () => {
    const outcome = await aiCreditGate({ accountId: "a1", feature: "cost_preview" });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "zero_credit" });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("returns a typed insufficient_ai_credits denial when over the limit", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: false, used: 20, limit: 20 });
    const outcome = await aiCreditGate({ accountId: "free-acct", feature: "workflow_repair" });
    expect(outcome).toEqual({ ok: false, reason: "insufficient_ai_credits", used: 20, limit: 20 });
  });

  it("refuses a frozen account BEFORE any deduct (freeze beats test-mode)", async () => {
    mockIsAccountFrozen.mockResolvedValue(true);
    const outcome = await aiCreditGate({ accountId: "frozen", feature: "workflow_explanation", testMode: true });
    expect(outcome).toEqual({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("test mode skips deduction (never charged)", async () => {
    const outcome = await aiCreditGate({ accountId: "a1", feature: "workflow_repair", testMode: true });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "test_mode" });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED on a deduct RPC error: returns gate_error, never ok:true", async () => {
    mockDeductAiCredits.mockRejectedValue(new Error("rpc down"));
    const outcome = await aiCreditGate({ accountId: "a1", feature: "workflow_repair" });
    expect(outcome).toEqual({ ok: false, reason: "gate_error", used: 0, limit: 0 });
  });
});
