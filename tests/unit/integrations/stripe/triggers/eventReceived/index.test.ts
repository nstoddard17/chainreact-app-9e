/**
 * @jest-environment node
 *
 * Module-init registration assertion: importing the trigger index
 * registers activate + deactivate hooks. NO subscription handler —
 * Stripe webhook endpoints don't expire.
 */
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
// Side-effect import — registers via _registry.ts.
import "@/integrations/_registry";

describe("Stripe event_received trigger registration", () => {
  it("registers activation hook for ('stripe', 'event_received')", () => {
    expect(findActivation("stripe", "event_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('stripe', 'event_received')", () => {
    expect(findDeactivation("stripe", "event_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — Stripe webhooks don't expire", () => {
    // Stripe webhook endpoints don't expire, so renewal is a no-op.
    // V2's idiomatic opt-out is to omit the subscription handler
    // AND skip the `config.type === "subscription-watch"` marker on
    // the trigger row. The runRenewals cron only enumerates rows
    // with that marker, so even if a stray subscription handler
    // existed, Stripe rows would be invisible to it.
    //
    // This test guards the registration side: no handler claims a
    // Stripe-shaped trigger row.
    const stripeTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "u",
      provider: "stripe",
      eventType: "event_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        endpointId: "we_test_1",
        endpointSecret: "whsec",
        enabledEvents: ["payment_intent.succeeded"],
      },
      accountId: null,
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(stripeTrigger)).toBeNull();
  });
});
