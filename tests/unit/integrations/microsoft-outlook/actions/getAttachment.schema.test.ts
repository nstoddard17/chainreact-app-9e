/**
 * @jest-environment node
 */
import { GetAttachmentConfigSchema } from "@/integrations/microsoft-outlook/actions/getAttachment.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
};

describe("GetAttachmentConfigSchema", () => {
  it("accepts the minimal valid config (emailId only — defaults apply)", () => {
    const parsed = GetAttachmentConfigSchema.parse(VALID_CONFIG);
    expect(parsed.emailId).toBe("AAMkAGI2");
    expect(parsed.downloadMode).toBe("all");
    expect(parsed.excludeInline).toBe(true);
  });

  it("applies D-OM3 defaults: downloadMode='all', excludeInline=true", () => {
    const parsed = GetAttachmentConfigSchema.parse({ emailId: "msg" });
    expect(parsed.downloadMode).toBe("all");
    expect(parsed.excludeInline).toBe(true);
  });

  it("rejects missing emailId", () => {
    expect(() => GetAttachmentConfigSchema.parse({})).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({ emailId: "" }),
    ).toThrow();
  });

  it("accepts downloadMode='by_extension' with fileExtensions string", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_extension",
      fileExtensions: "pdf,docx",
    });
    expect(parsed.downloadMode).toBe("by_extension");
    expect(parsed.fileExtensions).toBe("pdf,docx");
  });

  it("accepts fileExtensions as an array", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_extension",
      fileExtensions: ["pdf", "docx"],
    });
    expect(parsed.fileExtensions).toEqual(["pdf", "docx"]);
  });

  it("accepts downloadMode='by_name' with fileNameFilter", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_name",
      fileNameFilter: "report",
    });
    expect(parsed.downloadMode).toBe("by_name");
    expect(parsed.fileNameFilter).toBe("report");
  });

  it("rejects empty-string fileExtensions", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
        fileExtensions: "",
      }),
    ).toThrow();
  });

  it("rejects empty-array fileExtensions", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
        fileExtensions: [],
      }),
    ).toThrow();
  });

  it("rejects empty-string fileNameFilter", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_name",
        fileNameFilter: "",
      }),
    ).toThrow();
  });

  it("rejects unknown downloadMode", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "smart",
      }),
    ).toThrow();
  });

  it("rejects non-boolean excludeInline", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        excludeInline: "true" as unknown as boolean,
      }),
    ).toThrow();
  });

  it("accepts excludeInline=false", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      excludeInline: false,
    });
    expect(parsed.excludeInline).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        leak: "x",
      }),
    ).toThrow();
  });

  it("schema does NOT enforce conditional-required (fileExtensions when downloadMode=by_extension); handler does that post-parse", () => {
    // The schema accepts `downloadMode: by_extension` without
    // `fileExtensions` — the handler catches it post-parse with a
    // clear error.
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
      }),
    ).not.toThrow();
  });
});
