/**
 * @jest-environment node
 *
 * Module-init registration assertion: importing the trigger index
 * registers activate + deactivate hooks. NO subscription handler —
 * HubSpot webhook subscriptions don't expire (permanent endpoint
 * pattern, same as Slice 11 / Stripe + Slice 12 / Shopify).
 */
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
// Side-effect import — registers via _registry.ts.
import "@/integrations/_registry";

describe("HubSpot webhook_received trigger registration", () => {
  it("registers activation hook for ('hubspot', 'webhook_received')", () => {
    expect(findActivation("hubspot", "webhook_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('hubspot', 'webhook_received')", () => {
    expect(findDeactivation("hubspot", "webhook_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — HubSpot webhooks don't expire", () => {
    // HubSpot Public App webhook subscriptions are permanent until
    // explicit delete via the developer API or app uninstall. V2's
    // idiomatic opt-out is to omit the subscription handler AND skip
    // the `config.type === "subscription-watch"` marker. This test
    // guards: no handler claims a HubSpot-shaped trigger row.
    const hubspotTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "u",
      provider: "hubspot",
      eventType: "webhook_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        appId: "11223344",
        hubId: "9988776",
        subscriptions: [
          {
            eventType: "contact.creation",
            propertyName: null,
            appSubscriptionId: "app-sub-1",
            hubspotSubscriptionId: "hs-sub-aaa",
          },
        ],
      },
      accountId: "9988776",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(hubspotTrigger)).toBeNull();
  });
});
