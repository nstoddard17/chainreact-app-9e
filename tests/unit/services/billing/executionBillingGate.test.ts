/**
 * @jest-environment node
 *
 * Tests for services/billing/executionBillingGate.ts.
 *
 * The gate is a thin wrapper over userBillingRepo.deductTasks; tests mock
 * the repo and verify the discriminated-outcome shape on both branches.
 */

const mockDeductTasks = jest.fn();
jest.mock("@/repositories/userBilling", () => ({
  deductTasks: (...args: unknown[]) => mockDeductTasks(...args),
}));

import { executionBillingGate } from "@/services/billing/executionBillingGate";

beforeEach(() => {
  mockDeductTasks.mockReset();
});

describe("executionBillingGate", () => {
  it("returns ok=true when the deduction succeeds", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: true, used: 5, limit: 100 });
    const outcome = await executionBillingGate("user-1");
    expect(outcome).toEqual({ ok: true, used: 5, limit: 100 });
    expect(mockDeductTasks).toHaveBeenCalledWith("user-1", 1);
  });

  it("returns ok=false reason='limit_reached' when the deduction is refused", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: false, used: 100, limit: 100 });
    const outcome = await executionBillingGate("user-1");
    expect(outcome).toEqual({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });
  });

  it("Slice 1N charges exactly 1 task per run (no per-node pricing yet)", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: true, used: 1, limit: 100 });
    await executionBillingGate("user-1");
    expect(mockDeductTasks).toHaveBeenCalledWith("user-1", 1);
  });

  it("propagates repository errors (RPC failure surfaces, not silently swallowed)", async () => {
    mockDeductTasks.mockRejectedValueOnce(new Error("RPC down"));
    await expect(executionBillingGate("user-1")).rejects.toThrow(/RPC down/);
  });

  // ── COST-2A — test/dry-run runs do not bill ──────────────────────────────

  it("COST-2A skips deduction in test mode (ok=true, skipped, reason=test_mode)", async () => {
    const outcome = await executionBillingGate("user-1", { testMode: true });
    expect(outcome).toEqual({ ok: true, skipped: true, reason: "test_mode" });
  });

  it("COST-2A does NOT call deductTasks when testMode is true (no quota consumed, no DB write)", async () => {
    await executionBillingGate("user-1", { testMode: true });
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("COST-2A still bills real runs when testMode is explicitly false", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: true, used: 6, limit: 100 });
    const outcome = await executionBillingGate("user-1", { testMode: false });
    expect(outcome).toEqual({ ok: true, used: 6, limit: 100 });
    expect(mockDeductTasks).toHaveBeenCalledWith("user-1", 1);
  });

  it("COST-2A real-mode gate still fails closed when the quota is exhausted (testMode false)", async () => {
    mockDeductTasks.mockResolvedValueOnce({ ok: false, used: 100, limit: 100 });
    const outcome = await executionBillingGate("user-1", { testMode: false });
    expect(outcome).toEqual({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });
    expect(mockDeductTasks).toHaveBeenCalledWith("user-1", 1);
  });
});
