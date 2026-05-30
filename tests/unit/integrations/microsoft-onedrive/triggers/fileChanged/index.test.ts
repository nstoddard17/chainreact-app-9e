/**
 * @jest-environment node
 *
 * Module-init registration assertions for the OneDrive file_changed
 * trigger. The activation / deactivation / subscription registries are
 * populated as a side effect of importing the index module from
 * `integrations/_registry.ts`. Importing the trigger module here
 * exercises the same wiring.
 *
 * Test layout note: registries hold module-scoped state. Resetting +
 * re-importing between tests doesn't re-fire the side effects (Jest
 * caches the module). Instead we import ONCE at the top, then assert
 * the state shape across multiple tests. Same convention as Slice 7's
 * eventChanged/index.test.ts.
 */
import "@/integrations/microsoft-onedrive/triggers/fileChanged";

import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-onedrive",
  eventType: "file_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "x",
    resource: "/me/drive/root",
    changeType: "updated",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("OneDrive file_changed trigger module-init registration", () => {
  it("registers an activation handler under (microsoft-onedrive, file_changed)", () => {
    expect(
      findActivation("microsoft-onedrive", "file_changed"),
    ).not.toBeNull();
  });

  it("registers a deactivation handler under (microsoft-onedrive, file_changed)", () => {
    expect(
      findDeactivation("microsoft-onedrive", "file_changed"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle subscription-watch rows for this provider+event", () => {
    const handler = findSubscriptionHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("microsoft-onedrive:file_changed");
  });

  it("subscription handler does NOT match outlook mail or calendar rows (provider isolation)", () => {
    for (const sibling of [
      { provider: "microsoft-outlook", eventType: "new_email" },
      { provider: "microsoft-outlook-calendar", eventType: "event_changed" },
    ]) {
      const row = {
        ...triggerRow,
        provider: sibling.provider,
        eventType: sibling.eventType,
      };
      const handler = findSubscriptionHandler(row);
      expect(handler?.id).not.toBe("microsoft-onedrive:file_changed");
    }
  });
});
