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

import { GmailNewAttachmentConfigSchema } from "@/integrations/gmail/triggers/newAttachment/schema";
const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_attachment",
  nodeId: "n1",
  config: {},
  providerAccountId: null,
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

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Tests for the Gmail new_attachment config schema. Pins the fire-on-
// any-attachment minimal contract from Gmail 2.3 plan §13.2 and §13.5
// (V1's optional filters `fileType` / `from` / `minSize` deferred).
// ---------------------------------------------------------------------------

describe("GmailNewAttachmentConfigSchema", () => {
  it("accepts an empty config (no user-set filter fields in this version)", () => {
    const r = GmailNewAttachmentConfigSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts the polling-state fields", () => {
    const r = GmailNewAttachmentConfigSchema.safeParse({
      pollingEnabled: true,
      snapshot: {
        historyId: "12345",
        capturedAt: "2026-05-14T12:00:00Z",
      },
      polling: { lastPolledAt: "2026-05-14T12:01:00Z" },
    });
    expect(r.success).toBe(true);
  });

  // V1 fields intentionally NOT ported in this commit

  it("rejects V1 `fileType` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        fileType: "pdf",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `from` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        from: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `minSize` filter (deferred per Gmail 2.3 decision 13.5)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        minSize: 1024,
      }).success,
    ).toBe(false);
  });

  it("rejects newEmail-trigger config fields that don't belong here", () => {
    for (const dropped of [
      "subject",
      "subjectExactMatch",
      "hasAttachment",
      "labelIds",
      "aiContentFilter",
    ]) {
      const r = GmailNewAttachmentConfigSchema.safeParse({
        [dropped]: "value",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects new_labeled_email's `labelId` field", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        labelId: "Label_5",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      GmailNewAttachmentConfigSchema.safeParse({
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
