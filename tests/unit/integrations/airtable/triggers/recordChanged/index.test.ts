/**
 * @jest-environment node
 *
 * Integration registration test — importing
 * integrations/airtable/triggers/recordChanged registers the
 * activation, deactivation, and subscription handlers. The manifest
 * registry test (manifest.test.ts) already asserts that the registry
 * has the activation and deactivation hooks; this file additionally
 * asserts the subscription handler shape so changes to the renew
 * predicate / threshold surface explicitly.
 */
import "@/integrations/airtable/triggers/recordChanged";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

describe("airtable record_changed registrations", () => {
  it("registers activation and deactivation hooks", () => {
    expect(findActivation("airtable", "record_changed")).not.toBeNull();
    expect(findDeactivation("airtable", "record_changed")).not.toBeNull();
  });

  it("registers a subscription handler with id 'airtable:record_changed' and 6-day threshold", () => {
    const trigger = {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "user-1",
      provider: "airtable",
      eventType: "record_changed",
      nodeId: "n-1",
      config: { type: "subscription-watch" },
      accountId: null,
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(trigger);
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("airtable:record_changed");
    expect(handler!.getRenewalThresholdMs()).toBe(6 * 24 * 60 * 60 * 1000);
  });
});
