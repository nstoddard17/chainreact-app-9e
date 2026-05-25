/**
 * @jest-environment node
 *
 * Module-init registration assertions for the Gmail new_attachment
 * polling trigger. Importing the index module fires its side-effect
 * registrations:
 *   - registerActivation("gmail", "new_attachment", activate)
 *   - registerPollingHandler(gmailNewAttachmentPollingHandler)
 *
 * Same Jest caching convention as the existing newEmail / newLabeledEmail
 * index.test.ts — import once, assert across the test suite.
 */
import "@/integrations/gmail/triggers/newAttachment";

import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_attachment",
  nodeId: "n1",
  config: {},
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Gmail new_attachment module-init registration", () => {
  it("registers an activation handler under (gmail, new_attachment)", () => {
    expect(findActivation("gmail", "new_attachment")).not.toBeNull();
  });

  it("registers a polling handler that canHandle this provider+event", () => {
    const handler = findPollingHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match new_email rows (event-type isolation)", () => {
    const newEmailRow = { ...triggerRow, eventType: "new_email" };
    const handler = findPollingHandler(newEmailRow);
    expect(handler?.id).not.toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match new_labeled_email rows (event-type isolation)", () => {
    const newLabeledRow = { ...triggerRow, eventType: "new_labeled_email" };
    const handler = findPollingHandler(newLabeledRow);
    expect(handler?.id).not.toBe("gmail/new_attachment");
  });

  it("polling handler does NOT match other providers' rows (provider isolation)", () => {
    const otherProviderRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_attachment",
    };
    const handler = findPollingHandler(otherProviderRow);
    expect(handler).toBeNull();
  });
});
