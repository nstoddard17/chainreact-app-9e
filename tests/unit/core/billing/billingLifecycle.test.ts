/**
 * Slice 4.BILLING-PLAN-METADATA-6 / CS-5 — pure billing lifecycle derivation.
 * Warning-first: never claims runs are blocked; canceled/past_due keep access.
 */

import {
  deriveBillingLifecycle,
  type BillingLifecycleInput,
} from "@/core/billing/billingLifecycle";

function input(over: Partial<BillingLifecycleInput>): BillingLifecycleInput {
  return {
    plan: "pro",
    planStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("deriveBillingLifecycle", () => {
  it("active (not canceling) → no banner, renews boundary", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "active" }));
    expect(s.level).toBe("none");
    expect(s.statusLabel).toBe("Active");
    expect(s.description).toBe("");
    expect(s.periodEnd).toEqual({ iso: "2026-07-01T00:00:00.000Z", kind: "renews" });
  });

  it("trialing → info with a trial-ends boundary", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "trialing" }));
    expect(s.level).toBe("info");
    expect(s.statusLabel).toBe("Trial");
    expect(s.periodEnd?.kind).toBe("ends");
  });

  it("past_due → warning that KEEPS access (never says blocked)", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "past_due" }));
    expect(s.level).toBe("warning");
    expect(s.statusLabel).toMatch(/past due/i);
    expect(s.description).toMatch(/still active/i);
    expect(s.description).not.toMatch(/blocked|stopped|disabled|can't run|cannot run/i);
  });

  it("canceled → warning, no auto-downgrade language, access retained", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "canceled" }));
    expect(s.level).toBe("warning");
    expect(s.statusLabel).toBe("Canceled");
    expect(s.description).toMatch(/still have access/i);
    expect(s.description).not.toMatch(/downgrad|deleted/i);
  });

  it("active + cancel_at_period_end → warning 'canceling', ends boundary", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "active", cancelAtPeriodEnd: true }));
    expect(s.level).toBe("warning");
    expect(s.statusLabel).toMatch(/cancel/i);
    expect(s.description).toMatch(/won't renew/i);
    expect(s.periodEnd?.kind).toBe("ends");
  });

  it("incomplete → warning, no period boundary", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "incomplete" }));
    expect(s.level).toBe("warning");
    expect(s.periodEnd).toBeNull();
  });

  it("missing current_period_end → safe null boundary (no crash)", () => {
    const s = deriveBillingLifecycle(input({ planStatus: "past_due", currentPeriodEnd: null }));
    expect(s.level).toBe("warning");
    expect(s.periodEnd).toBeNull();
  });

  it("free plan suppresses any billing notice (no paid lifecycle)", () => {
    const s = deriveBillingLifecycle(
      input({ plan: "free", planStatus: "past_due", cancelAtPeriodEnd: true }),
    );
    expect(s.level).toBe("none");
    expect(s.description).toBe("");
    expect(s.periodEnd).toBeNull();
  });
});
