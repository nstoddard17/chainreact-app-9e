/**
 * @jest-environment node
 *
 * Module-init registration assertions for the Outlook Calendar
 * event_changed trigger. The activation / deactivation / subscription
 * registries are populated as a side effect of importing the index
 * module from `integrations/_registry.ts`. Importing the trigger module
 * here exercises the same wiring.
 *
 * Test layout note: the registries hold module-scoped state. Resetting
 * + re-importing between tests doesn't re-fire the side effects (Jest
 * caches the module). Instead we import ONCE at the top, then assert
 * the state shape across multiple tests.
 */
import "@/integrations/microsoft-outlook-calendar/triggers/eventChanged";

import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "x",
    resource: "/me/events",
    changeType: "created,updated,deleted",
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Outlook Calendar event_changed trigger module-init registration", () => {
  it("registers an activation handler under (microsoft-outlook-calendar, event_changed)", () => {
    expect(
      findActivation("microsoft-outlook-calendar", "event_changed"),
    ).not.toBeNull();
  });

  it("registers a deactivation handler under (microsoft-outlook-calendar, event_changed)", () => {
    expect(
      findDeactivation("microsoft-outlook-calendar", "event_changed"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle subscription-watch rows for this provider+event", () => {
    const handler = findSubscriptionHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("microsoft-outlook-calendar:event_changed");
  });

  it("subscription handler does NOT match the mail provider's new_email rows (provider isolation)", () => {
    const mailRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_email",
      config: { ...triggerRow.config, resource: "/me/messages" },
    };
    // The mail trigger may also be registered if other tests imported
    // it; what matters here is that the calendar handler doesn't claim
    // mail rows. Filter by id to verify isolation.
    const handler = findSubscriptionHandler(mailRow);
    expect(handler?.id).not.toBe("microsoft-outlook-calendar:event_changed");
  });
});
