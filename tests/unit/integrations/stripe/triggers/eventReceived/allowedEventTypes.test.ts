/**
 * @jest-environment node
 */
import {
  STRIPE_ALLOWED_EVENT_TYPES,
  isAllowedStripeEventType,
} from "@/integrations/stripe/triggers/eventReceived/allowedEventTypes";

describe("STRIPE_ALLOWED_EVENT_TYPES", () => {
  it("contains the 16 Slice 11 Batch 1 event types", () => {
    expect(STRIPE_ALLOWED_EVENT_TYPES.length).toBe(16);
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
      "customer.subscription.updated",
      "customer.updated",
      "invoice.paid",
      "invoice.payment_failed",
      "payment_intent.created",
      "payment_intent.payment_failed",
      "payment_intent.succeeded",
    ]);
  });

  it("has no duplicates", () => {
    const set = new Set(STRIPE_ALLOWED_EVENT_TYPES);
    expect(set.size).toBe(STRIPE_ALLOWED_EVENT_TYPES.length);
  });
});

describe("isAllowedStripeEventType", () => {
  it("returns true for allowlisted event types", () => {
    expect(isAllowedStripeEventType("payment_intent.succeeded")).toBe(true);
    expect(isAllowedStripeEventType("charge.refunded")).toBe(true);
    expect(isAllowedStripeEventType("checkout.session.completed")).toBe(true);
  });

  it("returns false for unsupported / out-of-allowlist event types", () => {
    expect(isAllowedStripeEventType("payment_intent.canceled")).toBe(false);
    expect(isAllowedStripeEventType("invoice.created")).toBe(false);
    expect(isAllowedStripeEventType("source.created")).toBe(false);
    expect(isAllowedStripeEventType("ping")).toBe(false);
  });

  it("returns false for empty / garbage input", () => {
    expect(isAllowedStripeEventType("")).toBe(false);
    expect(isAllowedStripeEventType("not-a-stripe-event")).toBe(false);
  });
});
