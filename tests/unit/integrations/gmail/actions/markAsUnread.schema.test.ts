/**
 * @jest-environment node
 *
 * Tests for the Gmail mark_as_unread config schema.
 */
import { MarkAsUnreadConfigSchema } from "@/integrations/gmail/actions/markAsUnread.schema";

describe("MarkAsUnreadConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      MarkAsUnreadConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(true);
  });

  it("rejects when messageId is missing", () => {
    expect(MarkAsUnreadConfigSchema.safeParse({}).success).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    expect(
      MarkAsUnreadConfigSchema.safeParse({ messageId: "" }).success,
    ).toBe(false);
  });

  it("rejects messageId as an array", () => {
    expect(
      MarkAsUnreadConfigSchema.safeParse({ messageId: ["m1"] }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      MarkAsUnreadConfigSchema.safeParse({
        messageId: "msg-1",
        searchQuery: "is:read",
      }).success,
    ).toBe(false);
  });
});
