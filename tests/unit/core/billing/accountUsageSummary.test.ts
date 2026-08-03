/** @jest-environment node */
/**
 * Tests for the consolidated account usage summary (Slice 4.BILLING-USAGE-VISIBILITY-1).
 *
 * Pure helper — folds task + AI-credit dimensions into a display-safe shape with
 * percent / near-limit / over-limit derived from the lazy-rollover period view.
 */
import {
  computeAccountUsageSummary,
  USAGE_NEAR_LIMIT_THRESHOLD,
  type AccountUsageSummaryInput,
} from "@/core/billing/accountUsageSummary";

// Fixed "now", 8 days into the period so nothing has rolled over.
const NOW = new Date("2026-06-09T00:00:00Z");
const PERIOD = "2026-06-01T00:00:00Z";

function input(over: Partial<AccountUsageSummaryInput> = {}): AccountUsageSummaryInput {
  return {
    billingMode: "standard",
    tasks: { used: 12, limit: 100, periodStartedAt: PERIOD },
    aiCredits: { used: 2, limit: 20, periodStartedAt: PERIOD },
    now: NOW,
    ...over,
  };
}

describe("computeAccountUsageSummary — standard account", () => {
  it("computes used / limit / remaining / percent for both dimensions", () => {
    const s = computeAccountUsageSummary(input());
    expect(s.billingMode).toBe("standard");
    expect(s.internalFree).toBe(false);

    expect(s.tasks).toMatchObject({
      available: true,
      used: 12,
      limit: 100,
      remaining: 88,
      percentUsed: 12,
      nearLimit: false,
      overLimit: false,
    });
    expect(s.tasks.resetsAt).toBe("2026-07-01T00:00:00.000Z");

    expect(s.aiCredits).toMatchObject({
      available: true,
      used: 2,
      limit: 20,
      remaining: 18,
      percentUsed: 10,
      nearLimit: false,
      overLimit: false,
    });
  });

  it("marks a dimension unavailable (not faked zeros) when its facts are null", () => {
    const s = computeAccountUsageSummary(input({ tasks: null, aiCredits: null }));
    expect(s.tasks.available).toBe(false);
    expect(s.aiCredits.available).toBe(false);
    // The "unavailable" shape carries no misleading reset boundary.
    expect(s.tasks.resetsAt).toBeNull();
  });
});

describe("computeAccountUsageSummary — internal_free account", () => {
  it("passes the billing mode through and flags internalFree, still computing usage", () => {
    const s = computeAccountUsageSummary(input({ billingMode: "internal_free" }));
    expect(s.billingMode).toBe("internal_free");
    expect(s.internalFree).toBe(true);
    // Usage is still tracked for internal accounts — the numbers are real.
    expect(s.tasks.used).toBe(12);
    expect(s.tasks.percentUsed).toBe(12);
  });
});

describe("computeAccountUsageSummary — near-limit", () => {
  it("flags nearLimit at the threshold but not over", () => {
    // 80 / 100 = exactly the 0.8 threshold.
    const s = computeAccountUsageSummary(
      input({ tasks: { used: 80, limit: 100, periodStartedAt: PERIOD } }),
    );
    expect(USAGE_NEAR_LIMIT_THRESHOLD).toBe(0.8);
    expect(s.tasks).toMatchObject({
      used: 80,
      remaining: 20,
      percentUsed: 80,
      nearLimit: true,
      overLimit: false,
    });
  });

  it("does NOT flag nearLimit just below the threshold", () => {
    const s = computeAccountUsageSummary(
      input({ tasks: { used: 79, limit: 100, periodStartedAt: PERIOD } }),
    );
    expect(s.tasks.nearLimit).toBe(false);
    expect(s.tasks.percentUsed).toBe(79);
  });
});

describe("computeAccountUsageSummary — over-limit", () => {
  it("flags overLimit (and not nearLimit) when the dimension is exhausted", () => {
    const s = computeAccountUsageSummary(
      input({ aiCredits: { used: 20, limit: 20, periodStartedAt: PERIOD } }),
    );
    expect(s.aiCredits).toMatchObject({
      used: 20,
      remaining: 0,
      percentUsed: 100,
      nearLimit: false,
      overLimit: true,
    });
  });

  it("clamps percent at 100 and remaining at 0 when used exceeds limit", () => {
    const s = computeAccountUsageSummary(
      input({ tasks: { used: 150, limit: 100, periodStartedAt: PERIOD } }),
    );
    expect(s.tasks.percentUsed).toBe(100);
    expect(s.tasks.remaining).toBe(0);
    expect(s.tasks.overLimit).toBe(true);
  });
});

describe("computeAccountUsageSummary — period rollover", () => {
  it("reflects the pending lazy reset (0 used) for an elapsed period, not stale usage", () => {
    // Stored row from a period that started 2 months before NOW.
    const s = computeAccountUsageSummary(
      input({ tasks: { used: 95, limit: 100, periodStartedAt: "2026-04-01T00:00:00Z" } }),
    );
    expect(s.tasks.used).toBe(0);
    expect(s.tasks.remaining).toBe(100);
    expect(s.tasks.percentUsed).toBe(0);
    expect(s.tasks.nearLimit).toBe(false);
  });

  it("handles a missing period anchor without a reset date and with no divide error", () => {
    const s = computeAccountUsageSummary(
      input({ tasks: { used: 12, limit: 0, periodStartedAt: null } }),
    );
    expect(s.tasks.percentUsed).toBe(0); // limit 0 → no divide
    expect(s.tasks.resetsAt).toBeNull();
  });
});
