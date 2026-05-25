/**
 * @jest-environment node
 *
 * Module-init registration assertion: importing the trigger index
 * registers activate + deactivate hooks. NO subscription handler —
 * Shopify webhook subscriptions don't expire (permanent endpoint
 * pattern, same as Slice 11 / Stripe).
 */
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
// Side-effect import — registers via _registry.ts.
import "@/integrations/_registry";

describe("Shopify webhook_received trigger registration", () => {
  it("registers activation hook for ('shopify', 'webhook_received')", () => {
    expect(findActivation("shopify", "webhook_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('shopify', 'webhook_received')", () => {
    expect(findDeactivation("shopify", "webhook_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — Shopify webhooks don't expire", () => {
    // Shopify webhook subscriptions are permanent until explicit
    // delete or merchant uninstall. V2's idiomatic opt-out is to omit
    // the subscription handler AND skip the
    // `config.type === "subscription-watch"` marker on the trigger
    // row. The runRenewals cron only enumerates rows with that
    // marker, so even if a stray subscription handler existed,
    // Shopify rows would be invisible to it.
    //
    // This test guards the registration side: no handler claims a
    // Shopify-shaped trigger row.
    const shopifyTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "u",
      provider: "shopify",
      eventType: "webhook_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        shopDomain: "merchant.myshopify.com",
        topics: ["orders/create"],
        subscriptions: [{ topic: "orders/create", webhookId: 111 }],
      },
      accountId: "merchant.myshopify.com",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(shopifyTrigger)).toBeNull();
  });
});
