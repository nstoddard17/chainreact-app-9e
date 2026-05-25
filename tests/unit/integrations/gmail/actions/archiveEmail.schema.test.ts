/**
 * @jest-environment node
 *
 * Tests for the Gmail archive_email config schema.
 */
import { ArchiveEmailConfigSchema } from "@/integrations/gmail/actions/archiveEmail.schema";

describe("ArchiveEmailConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      ArchiveEmailConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(true);
  });

  it("rejects when messageId is missing or empty", () => {
    expect(ArchiveEmailConfigSchema.safeParse({}).success).toBe(false);
    expect(
      ArchiveEmailConfigSchema.safeParse({ messageId: "" }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      ArchiveEmailConfigSchema.safeParse({
        messageId: "msg-1",
        applyToThread: true,
      }).success,
    ).toBe(false);
  });
});
