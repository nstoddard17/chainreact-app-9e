/**
 * @jest-environment node
 *
 * Tests for the Gmail `get_attachment` config schema. Pins the
 * single-attachment-per-action minimal contract from Gmail 2.3
 * plan §7 — strict mode rejects every V1 field the action audit
 * called out (R8 / G-R5).
 */
import { GetAttachmentConfigSchema } from "@/integrations/gmail/actions/getAttachment.schema";

describe("GetAttachmentConfigSchema", () => {
  it("accepts a valid messageId + attachmentId", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
      }).success,
    ).toBe(true);
  });

  it("rejects when messageId is missing", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        attachmentId: "att-1",
      }).success,
    ).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "",
        attachmentId: "att-1",
      }).success,
    ).toBe(false);
  });

  it("rejects when attachmentId is missing", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
      }).success,
    ).toBe(false);
  });

  it("rejects when attachmentId is empty string", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });

  // V1 fields intentionally rejected

  it("rejects V1 `attachmentSelection` field", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        attachmentSelection: "all",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `saveToVariable` field", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        saveToVariable: true,
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `storageService` field", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        storageService: "google-drive",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `folderId` field", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        folderId: "folder-1",
      }).success,
    ).toBe(false);
  });

  it("rejects inline-byte fields — `data`, `content`, `base64`", () => {
    for (const dropped of ["data", "content", "base64"]) {
      const r = GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        [dropped]: "AAAA",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects `fileName` / `mimeType` overrides (derived from Gmail metadata, not config)", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        fileName: "override.pdf",
      }).success,
    ).toBe(false);
    expect(
      GetAttachmentConfigSchema.safeParse({
        messageId: "msg-1",
        attachmentId: "att-1",
        mimeType: "text/plain",
      }).success,
    ).toBe(false);
  });
});
