/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — pure Stripe Subscription readers shared by the
 * inbound webhook and the outbound cancel/resume/purge paths. Proves the Basil-vs-pre-Basil
 * period resolution and the deliberately CONSERVATIVE liveness rule (unknown status reads
 * as live, so the purge fail-closed guard never destroys data on a status we don't know).
 */

import {
  isLiveStripeSubscriptionStatus,
  resolveSubscriptionPeriodEndSeconds,
} from "@/core/billing/stripeSubscriptionFacts";

describe("resolveSubscriptionPeriodEndSeconds", () => {
  it("prefers the pre-Basil top-level current_period_end", () => {
    expect(
      resolveSubscriptionPeriodEndSeconds({
        current_period_end: 1000,
        items: { data: [{ current_period_end: 2000 }] },
      }),
    ).toBe(1000);
  });

  it("falls back to the FURTHEST-OUT Basil per-item period", () => {
    expect(
      resolveSubscriptionPeriodEndSeconds({
        items: {
          data: [
            { current_period_end: 1500 },
            { current_period_end: 4000 },
            { current_period_end: 2500 },
          ],
        },
      }),
    ).toBe(4000);
  });

  it("returns null when neither location carries a finite number", () => {
    expect(resolveSubscriptionPeriodEndSeconds({})).toBeNull();
    expect(resolveSubscriptionPeriodEndSeconds({ current_period_end: "soon" })).toBeNull();
    expect(resolveSubscriptionPeriodEndSeconds({ items: { data: [{}] } })).toBeNull();
    expect(
      resolveSubscriptionPeriodEndSeconds({ current_period_end: Number.NaN }),
    ).toBeNull();
  });
});

describe("isLiveStripeSubscriptionStatus", () => {
  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])(
    "treats %s as still live",
    (status) => {
      expect(isLiveStripeSubscriptionStatus(status)).toBe(true);
    },
  );

  it.each(["canceled", "incomplete_expired"])("treats %s as terminal", (status) => {
    expect(isLiveStripeSubscriptionStatus(status)).toBe(false);
  });

  it("treats an UNKNOWN future status as live (fail-closed for purge)", () => {
    expect(isLiveStripeSubscriptionStatus("some_new_stripe_status")).toBe(true);
  });

  it("treats a missing status as not live", () => {
    expect(isLiveStripeSubscriptionStatus(null)).toBe(false);
  });
});
