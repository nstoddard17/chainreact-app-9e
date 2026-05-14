/**
 * @jest-environment node
 *
 * Tests for the Gmail new_attachment config schema. Pins the fire-on-
 * any-attachment minimal contract from Gmail 2.3 plan §13.2 and §13.5
 * (V1's optional filters `fileType` / `from` / `minSize` deferred).
 */
import { GmailNewAttachmentConfigSchema } from "@/integrations/gmail/triggers/newAttachment/schema";

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
