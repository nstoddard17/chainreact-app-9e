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

/**
 * REACT-AGENT-FIRST-TURN-1 — the DEFERRED-CHARGE pair.
 *
 * `aiCreditGate` charges before the model call, which meant a guidance turn that ended in a typed
 * terminal failure billed the customer for nothing (the ledger is deduct-only — no refund RPC
 * exists, so the charge could not be undone). The guidance route now PRECHECKS, then charges once
 * on success. These pin that the precheck refuses exactly like the gate but writes nothing, and
 * that the charge is the only thing that touches the balance.
 */
import { aiCreditPrecheck, chargeAiCreditsForSuccess } from "@/services/billing/aiCreditGate";

describe("aiCreditPrecheck — authorizes without touching the balance", () => {
  it("flag OFF is a pure no-op: no frozen check, no ledger call at all", async () => {
    mockFlag.mockReturnValue(false);
    const outcome = await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance" });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "enforcement_disabled" });
    expect(mockIsAccountFrozen).not.toHaveBeenCalled();
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("authorizes an affordable call and CHARGES NOTHING (the probe is a zero-amount no-op)", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 5, limit: 20 });
    const outcome = await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance" });
    expect(outcome).toEqual({
      ok: true,
      pending: { accountId: "a1", credits: 1 },
      used: 5,
      limit: 20,
    });
    // The ONLY ledger call is the zero-amount rollover probe — no credit is taken here.
    expect(mockDeductAiCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductAiCredits).toHaveBeenCalledWith("a1", 0);
  });

  it("reads through a ZERO-amount deduct so a new billing period's reset is seen", async () => {
    // A plain SELECT would miss the lazy AI-period rollover the RPC performs, and would wrongly
    // refuse a user whose credits had in fact just reset.
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 0, limit: 20 });
    await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance" });
    expect(mockDeductAiCredits).toHaveBeenCalledWith("a1", 0);
  });

  it("refuses when the charge would exceed the limit — before any model call", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 20, limit: 20 });
    const outcome = await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance" });
    expect(outcome).toEqual({ ok: false, reason: "insufficient_ai_credits", used: 20, limit: 20 });
  });

  it("refuses a frozen account before touching the ledger", async () => {
    mockIsAccountFrozen.mockResolvedValue(true);
    const outcome = await aiCreditPrecheck({ accountId: "frozen", feature: "workflow_guidance" });
    expect(outcome).toEqual({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("test mode authorizes nothing to charge", async () => {
    const outcome = await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance", testMode: true });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "test_mode" });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED on an RPC error, exactly like the pre-call gate", async () => {
    mockDeductAiCredits.mockRejectedValue(new Error("rpc down"));
    const outcome = await aiCreditPrecheck({ accountId: "a1", feature: "workflow_guidance" });
    expect(outcome).toEqual({ ok: false, reason: "gate_error", used: 0, limit: 0 });
  });
});

describe("chargeAiCreditsForSuccess — the single customer charge", () => {
  it("charges the pre-authorized amount exactly once", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 6, limit: 20 });
    const result = await chargeAiCreditsForSuccess({ accountId: "a1", credits: 1 });
    expect(result).toEqual({ charged: 1, outcome: "charged" });
    expect(mockDeductAiCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductAiCredits).toHaveBeenCalledWith("a1", 1);
  });

  it("a null authorization (nothing owed) never touches the ledger — no artificial credits", async () => {
    const result = await chargeAiCreditsForSuccess(null);
    expect(result).toEqual({ charged: 0, outcome: "not_owed" });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("a zero-credit authorization never touches the ledger", async () => {
    const result = await chargeAiCreditsForSuccess({ accountId: "a1", credits: 0 });
    expect(result).toEqual({ charged: 0, outcome: "not_owed" });
    expect(mockDeductAiCredits).not.toHaveBeenCalled();
  });

  it("reports a cap race without throwing (the user keeps their delivered answer)", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: false, used: 20, limit: 20 });
    const result = await chargeAiCreditsForSuccess({ accountId: "a1", credits: 1 });
    expect(result).toEqual({ charged: 0, outcome: "cap_reached" });
  });

  it("NEVER throws on an RPC failure — a ledger problem cannot fail a successful turn", async () => {
    mockDeductAiCredits.mockRejectedValue(new Error("rpc down"));
    await expect(chargeAiCreditsForSuccess({ accountId: "a1", credits: 1 })).resolves.toEqual({
      charged: 0,
      outcome: "charge_error",
    });
  });

  it("charges once per call — a repeated terminal handler cannot double-bill (the route calls it once)", async () => {
    mockDeductAiCredits.mockResolvedValue({ ok: true, used: 6, limit: 20 });
    await chargeAiCreditsForSuccess({ accountId: "a1", credits: 1 });
    expect(mockDeductAiCredits).toHaveBeenCalledTimes(1);
  });
});
