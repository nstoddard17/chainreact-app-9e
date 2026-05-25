/**
 * @jest-environment node
 *
 * Tests for the Gmail mark_as_read config schema.
 */
import { MarkAsReadConfigSchema } from "@/integrations/gmail/actions/markAsRead.schema";

describe("MarkAsReadConfigSchema", () => {
  it("accepts a minimal valid config (messageId only)", () => {
    expect(
      MarkAsReadConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(true);
  });

  it("rejects when messageId is missing", () => {
    expect(MarkAsReadConfigSchema.safeParse({}).success).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    expect(
      MarkAsReadConfigSchema.safeParse({ messageId: "" }).success,
    ).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped)", () => {
    expect(
      MarkAsReadConfigSchema.safeParse({ messageId: ["m1", "m2"] }).success,
    ).toBe(false);
  });

  it("rejects searchQuery (V1 bulk-mark-by-search dropped)", () => {
    expect(
      MarkAsReadConfigSchema.safeParse({
        messageId: "msg-1",
        searchQuery: "is:unread",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      MarkAsReadConfigSchema.safeParse({
        messageId: "msg-1",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
