/**
 * @jest-environment node
 */
import { AddAttachmentConfigSchema } from "@/integrations/airtable/actions/addAttachment.schema";

const validV2Storage = {
  baseId: "appBASE",
  tableIdOrName: "tblTASKS",
  recordId: "rec123",
  fieldName: "Photo",
  file: {
    kind: "v2_storage",
    name: "photo.png",
    mimeType: "image/png",
    storagePath: "u/w/r/n/photo.png",
  },
} as const;

const validSignedUrl = {
  baseId: "appBASE",
  tableIdOrName: "tblTASKS",
  recordId: "rec123",
  fieldName: "Photo",
  file: {
    kind: "signed_url",
    name: "photo.png",
    mimeType: "image/png",
    url: "https://signed.example/abc",
  },
} as const;

const validProviderUrl = {
  baseId: "appBASE",
  tableIdOrName: "tblTASKS",
  recordId: "rec123",
  fieldName: "Photo",
  file: {
    kind: "provider_url",
    name: "photo.png",
    mimeType: "image/png",
    url: "https://slack.example/files/F123",
    provider: "slack",
  },
} as const;

describe("AddAttachmentConfigSchema", () => {
  it("accepts a minimal valid config with v2_storage FileRef", () => {
    const result = AddAttachmentConfigSchema.safeParse(validV2Storage);
    expect(result.success).toBe(true);
  });

  it("accepts a signed_url FileRef", () => {
    const result = AddAttachmentConfigSchema.safeParse(validSignedUrl);
    expect(result.success).toBe(true);
  });

  it("accepts a provider_url FileRef at schema layer (handler runtime rejects)", () => {
    // Schema does NOT reject provider_url — the discriminator value is
    // valid. The handler's runtime AirtableAddAttachmentConfigError is
    // what surfaces the rejection so the error can carry an unblock
    // hint (matches Slack 2.4 upload_file pattern).
    const result = AddAttachmentConfigSchema.safeParse(validProviderUrl);
    expect(result.success).toBe(true);
  });

  it("accepts an optional filename override (non-empty)", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      filename: "renamed.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing baseId", () => {
    const { baseId: _, ...rest } = validV2Storage;
    void _;
    const result = AddAttachmentConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing tableIdOrName", () => {
    const { tableIdOrName: _, ...rest } = validV2Storage;
    void _;
    const result = AddAttachmentConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing recordId", () => {
    const { recordId: _, ...rest } = validV2Storage;
    void _;
    const result = AddAttachmentConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing fieldName", () => {
    const { fieldName: _, ...rest } = validV2Storage;
    void _;
    const result = AddAttachmentConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing file", () => {
    const { file: _, ...rest } = validV2Storage;
    void _;
    const result = AddAttachmentConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty-string baseId / tableIdOrName / recordId / fieldName", () => {
    expect(
      AddAttachmentConfigSchema.safeParse({ ...validV2Storage, baseId: "" })
        .success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({
        ...validV2Storage,
        tableIdOrName: "",
      }).success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({ ...validV2Storage, recordId: "" })
        .success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({ ...validV2Storage, fieldName: "" })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid FileRef (missing required FileRef fields)", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      file: { kind: "v2_storage" }, // missing name, mimeType, storagePath
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string filename override", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      filename: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects FileRef with inline bytes / content / base64 keys (P-S3 invariant)", () => {
    expect(
      AddAttachmentConfigSchema.safeParse({
        ...validV2Storage,
        file: { ...validV2Storage.file, content: "raw" },
      }).success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({
        ...validV2Storage,
        file: { ...validV2Storage.file, bytes: "raw" },
      }).success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({
        ...validV2Storage,
        file: { ...validV2Storage.file, base64: "raw" },
      }).success,
    ).toBe(false);
    expect(
      AddAttachmentConfigSchema.safeParse({
        ...validV2Storage,
        file: { ...validV2Storage.file, data: "raw" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown top-level fields (.strict)", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      somethingExtra: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred preserveExisting flag (NPD-A5 — feature deferred)", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      preserveExisting: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred appendToExisting flag (NPD-A6 — feature deferred)", () => {
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      appendToExisting: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a raw attachment-object passthrough on a 'file' key", () => {
    // Workflow authors who think they can shortcut by passing a raw
    // Airtable attachment object should hit a schema failure — the
    // shape isn't a FileRef.
    const result = AddAttachmentConfigSchema.safeParse({
      ...validV2Storage,
      file: {
        url: "https://airtable.example/raw",
        filename: "raw.png",
      },
    });
    expect(result.success).toBe(false);
  });
});
