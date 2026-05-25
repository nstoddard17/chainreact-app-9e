/**
 * @jest-environment node
 *
 * Tests for the Gmail new_labeled_email config schema. Pins the
 * minimal-labelId-only contract from Gmail 2.3 plan §13.3.
 */
import { GmailNewLabeledEmailConfigSchema } from "@/integrations/gmail/triggers/newLabeledEmail/schema";

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
