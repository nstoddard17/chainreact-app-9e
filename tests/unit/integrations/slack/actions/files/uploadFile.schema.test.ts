/**
 * @jest-environment node
 *
 * Schema tests for integrations/slack/actions/files/uploadFile.schema.ts
 * (Slack 2.4 Commit 3).
 */
import { SlackUploadFileConfigSchema } from "@/integrations/slack/actions/files/uploadFile.schema";

const validV2Storage = {
  kind: "v2_storage" as const,
  name: "report.pdf",
  mimeType: "application/pdf",
  storagePath: "user-1/wf-1/run-1/node-1/report.pdf",
};

const validSignedUrl = {
  kind: "signed_url" as const,
  name: "snapshot.bin",
  mimeType: "application/octet-stream",
  url: "https://signed.example.com/abc",
};

const validProviderUrl = {
  kind: "provider_url" as const,
  name: "shared.pdf",
  mimeType: "application/pdf",
  url: "https://files.slack.com/files-pri/T1-F1/shared.pdf",
  provider: "slack",
};

describe("SlackUploadFileConfigSchema — channel + file", () => {
  it("accepts a config with a v2_storage FileRef and a C-prefixed channel id", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C12345",
      file: validV2Storage,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a config with a signed_url FileRef", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C12345",
      file: validSignedUrl,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a provider_url FileRef at the schema layer (handler enforces the rejection with a richer hint)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C12345",
      file: validProviderUrl,
    });
    expect(r.success).toBe(true);
  });

  it("accepts G-prefixed legacy private channel ids", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "G98765",
      file: validV2Storage,
    });
    expect(r.success).toBe(true);
  });

  it("accepts D-prefixed DM channel ids", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "D11111",
      file: validV2Storage,
    });
    expect(r.success).toBe(true);
  });

  it("rejects channel ids that aren't strict Slack ids (no #name resolution)", () => {
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "#general",
        file: validV2Storage,
      }).success,
    ).toBe(false);
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "general",
        file: validV2Storage,
      }).success,
    ).toBe(false);
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "c12345",
        file: validV2Storage,
      }).success,
    ).toBe(false);
  });

  it("rejects when `file` is missing", () => {
    const r = SlackUploadFileConfigSchema.safeParse({ channel: "C1" });
    expect(r.success).toBe(false);
  });

  it("rejects when `channel` is missing", () => {
    const r = SlackUploadFileConfigSchema.safeParse({ file: validV2Storage });
    expect(r.success).toBe(false);
  });

  it("rejects a non-FileRef `file` value (FileRefSchema is strict)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: { url: "https://x.test/file.pdf" },
    });
    expect(r.success).toBe(false);
  });
});

describe("SlackUploadFileConfigSchema — V1-rot rejection (strict mode)", () => {
  it("rejects an inline `content` field (V1 rot — base64/text arms)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      content: "Hello world",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a `base64Data` field (V1 rot — base64 arm)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      base64Data: "aGVsbG8=",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a `fileUrl` field (V1 rot — raw URL arm)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      fileUrl: "https://example.com/file.pdf",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a `fileSource` discriminator (V1 rot)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      fileSource: "content",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an `asUser` toggle (V1 rot — bot-token only in V2)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      asUser: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a `workspace` selector field (V1 rot — accountId resolves via triggerEvent)", () => {
    const r = SlackUploadFileConfigSchema.safeParse({
      channel: "C1",
      file: validV2Storage,
      workspace: "T0001",
    });
    expect(r.success).toBe(false);
  });
});

describe("SlackUploadFileConfigSchema — optional fields", () => {
  it("accepts title", () => {
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "C1",
        file: validV2Storage,
        title: "Q1 Report",
      }).success,
    ).toBe(true);
  });

  it("accepts initialComment", () => {
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "C1",
        file: validV2Storage,
        initialComment: "Here's the report",
      }).success,
    ).toBe(true);
  });

  it("accepts threadTs in Slack's <seconds>.<microseconds> format", () => {
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "C1",
        file: validV2Storage,
        threadTs: "1730000000.000123",
      }).success,
    ).toBe(true);
  });

  it("rejects empty optional strings (we treat empty as omit-from-payload, not a value)", () => {
    expect(
      SlackUploadFileConfigSchema.safeParse({
        channel: "C1",
        file: validV2Storage,
        title: "",
      }).success,
    ).toBe(false);
  });
});
