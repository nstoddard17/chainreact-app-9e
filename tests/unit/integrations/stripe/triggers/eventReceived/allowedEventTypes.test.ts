/**
 * @jest-environment node
 */
import {
  STRIPE_ALLOWED_EVENT_TYPES,
  isAllowedStripeEventType,
} from "@/integrations/stripe/triggers/eventReceived/allowedEventTypes";

describe("STRIPE_ALLOWED_EVENT_TYPES", () => {
  it("contains the 18 curated event types (Slice 11 baseline + Stripe 2.1 Commit 3 additions)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES.length).toBe(18);
    expect([...STRIPE_ALLOWED_EVENT_TYPES].sort()).toEqual([
      "charge.dispute.created",
      "charge.failed",
      "charge.refunded",
      "charge.succeeded",
      "checkout.session.completed",
      "customer.created",
      "customer.deleted",
      "customer.subscription.created",
      "customer.subscription.deleted",
      "customer.subscription.trial_will_end",
      "customer.subscription.updated",
      "customer.updated",
      "invoice.created",
      "invoice.paid",
      "invoice.payment_failed",
      "payment_intent.created",
      "payment_intent.payment_failed",
      "payment_intent.succeeded",
    ]);
  });

  it("includes invoice.created (Stripe 2.1 Commit 3 — pairs with create_invoice action)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES).toContain("invoice.created");
  });

  it("includes customer.subscription.trial_will_end (Stripe 2.1 Commit 3 — trial-end workflow trigger)", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES).toContain(
      "customer.subscription.trial_will_end",
    );
  });

  it("preserves all Slice 11 Batch 1 baseline events", () => {
    // Regression guard — the 16 original events must remain in the
    // allowlist regardless of additive batch updates.
    const sliceBaseline = [
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_intent.created",
      "charge.succeeded",
      "charge.failed",
      "charge.refunded",
      "charge.dispute.created",
      "customer.created",
      "customer.updated",
      "customer.deleted",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
    ];
    for (const event of sliceBaseline) {
      expect(STRIPE_ALLOWED_EVENT_TYPES).toContain(event);
    }
  });

  it("has no duplicates", () => {
    const set = new Set(STRIPE_ALLOWED_EVENT_TYPES);
    expect(set.size).toBe(STRIPE_ALLOWED_EVENT_TYPES.length);
  });
});

describe("isAllowedStripeEventType", () => {
  it("returns true for Slice 11 baseline event types", () => {
    expect(isAllowedStripeEventType("payment_intent.succeeded")).toBe(true);
    expect(isAllowedStripeEventType("charge.refunded")).toBe(true);
    expect(isAllowedStripeEventType("checkout.session.completed")).toBe(true);
  });

  it("returns true for Stripe 2.1 Commit 3 additions", () => {
    expect(isAllowedStripeEventType("invoice.created")).toBe(true);
    expect(
      isAllowedStripeEventType("customer.subscription.trial_will_end"),
    ).toBe(true);
  });

  it("returns false for unsupported / out-of-allowlist event types", () => {
    expect(isAllowedStripeEventType("payment_intent.canceled")).toBe(false);
    expect(isAllowedStripeEventType("invoice.finalized")).toBe(false);
    expect(isAllowedStripeEventType("source.created")).toBe(false);
    expect(isAllowedStripeEventType("ping")).toBe(false);
  });

  it("returns false for empty / garbage input", () => {
    expect(isAllowedStripeEventType("")).toBe(false);
    expect(isAllowedStripeEventType("not-a-stripe-event")).toBe(false);
  });
});
