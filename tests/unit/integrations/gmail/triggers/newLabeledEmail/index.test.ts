/**
 * @jest-environment node
 *
 * Module-init registration assertions for the Gmail
 * new_labeled_email polling trigger. Importing the index module
 * fires its side-effect registrations:
 *   - registerActivation("gmail", "new_labeled_email", activate)
 *   - registerPollingHandler(gmailNewLabeledEmailPollingHandler)
 *
 * Same Jest caching convention as the existing OneDrive
 * fileChanged/index.test.ts — import once, assert across the test
 * suite.
 */
import "@/integrations/gmail/triggers/newLabeledEmail";

import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";

import { GmailNewLabeledEmailConfigSchema } from "@/integrations/gmail/triggers/newLabeledEmail/schema";
const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_labeled_email",
  nodeId: "n1",
  config: { labelId: "Label_5" },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Gmail new_labeled_email module-init registration", () => {
  it("registers an activation handler under (gmail, new_labeled_email)", () => {
    expect(findActivation("gmail", "new_labeled_email")).not.toBeNull();
  });

  it("registers a polling handler that canHandle this provider+event", () => {
    const handler = findPollingHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("gmail/new_labeled_email");
  });

  it("polling handler does NOT match new_email rows (event-type isolation)", () => {
    const newEmailRow = { ...triggerRow, eventType: "new_email" };
    const handler = findPollingHandler(newEmailRow);
    expect(handler?.id).not.toBe("gmail/new_labeled_email");
  });

  it("polling handler does NOT match other providers' rows (provider isolation)", () => {
    const otherProviderRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_labeled_email",
    };
    const handler = findPollingHandler(otherProviderRow);
    expect(handler).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Tests for the Gmail new_labeled_email config schema. Pins the
// minimal-labelId-only contract from Gmail 2.3 plan §13.3.
// ---------------------------------------------------------------------------

describe("GmailNewLabeledEmailConfigSchema", () => {
  it("accepts a minimal valid config (labelId only)", () => {
    const r = GmailNewLabeledEmailConfigSchema.safeParse({
      labelId: "Label_5",
    });
    expect(r.success).toBe(true);
  });

  it("accepts the polling-state fields alongside labelId", () => {
    const r = GmailNewLabeledEmailConfigSchema.safeParse({
      labelId: "Label_5",
      pollingEnabled: true,
      snapshot: {
        historyId: "12345",
        capturedAt: "2026-05-12T12:00:00Z",
      },
      polling: { lastPolledAt: "2026-05-12T12:01:00Z" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects when labelId is missing", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({}).success,
    ).toBe(false);
  });

  it("rejects when labelId is empty string", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({ labelId: "" }).success,
    ).toBe(false);
  });

  // V1 fields intentionally NOT ported in this commit

  it("rejects V1 `from` filter (deferred per Gmail 2.3 decision 13.3)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        from: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `includeReplies` toggle (deferred per Gmail 2.3 decision 13.3)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        includeReplies: true,
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
      const r = GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        [dropped]: "value",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      GmailNewLabeledEmailConfigSchema.safeParse({
        labelId: "Label_5",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
