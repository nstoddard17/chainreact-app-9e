/**
 * @jest-environment node
 */
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

// Side-effect import forces module-init registrations.
import "@/integrations/microsoft-teams/triggers/newChannelMessage";

function fakeTrigger(): import("@/repositories/triggerResources").TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config: { type: "subscription-watch" },
    accountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Teams new_channel_message module registration", () => {
  it("registers an activation fn for (microsoft-teams, new_channel_message)", () => {
    expect(
      findActivation("microsoft-teams", "new_channel_message"),
    ).not.toBeNull();
  });

  it("registers a deactivation fn for (microsoft-teams, new_channel_message)", () => {
    expect(
      findDeactivation("microsoft-teams", "new_channel_message"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle the Teams subscription-watch trigger", () => {
    const handler = findSubscriptionHandler(fakeTrigger());
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("microsoft-teams:new_channel_message");
  });
});
