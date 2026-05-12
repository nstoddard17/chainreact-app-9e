import { ZodError } from "zod";

import {
  fileRefFromProviderUrl,
  fileRefFromSignedUrl,
  fileRefFromStoragePath,
} from "@/core/files/createFileRef";
import { FileRefSchema } from "@/contracts/file";

describe("fileRefFromProviderUrl", () => {
  const minimal = {
    name: "report.pdf",
    mimeType: "application/pdf",
    url: "https://files.slack.com/files-pri/T1-F1/report.pdf",
    provider: "slack",
  };

  it("builds a `provider_url` FileRef from the minimum inputs", () => {
    const ref = fileRefFromProviderUrl(minimal);
    expect(ref.kind).toBe("provider_url");
    expect(ref.name).toBe("report.pdf");
    expect(ref.mimeType).toBe("application/pdf");
    expect(ref.url).toBe(minimal.url);
    expect(ref.provider).toBe("slack");
    expect(FileRefSchema.safeParse(ref).success).toBe(true);
  });

  it("includes optional fields when supplied", () => {
    const ref = fileRefFromProviderUrl({
      ...minimal,
      sizeBytes: 4096,
      providerFileId: "F12345",
      expiresAt: "2026-05-12T01:00:00Z",
      metadata: { permalink: "https://example.com/p" },
    });
    expect(ref.sizeBytes).toBe(4096);
    expect(ref.providerFileId).toBe("F12345");
    expect(ref.expiresAt).toBe("2026-05-12T01:00:00Z");
    expect(ref.metadata?.permalink).toBe("https://example.com/p");
  });

  it("sanitizes the file name (strips path separators)", () => {
    const ref = fileRefFromProviderUrl({
      ...minimal,
      name: "../etc/evil.pdf",
    });
    expect(ref.name).toBe("..etcevil.pdf");
  });

  it("throws ZodError on an invalid URL", () => {
    expect(() =>
      fileRefFromProviderUrl({ ...minimal, url: "not a url" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError on a malformed provider id", () => {
    expect(() =>
      fileRefFromProviderUrl({ ...minimal, provider: "Slack" }),
    ).toThrow(ZodError);
  });

  it("omits `undefined` optional fields rather than emitting present-but-undefined keys", () => {
    const ref = fileRefFromProviderUrl(minimal);
    expect(Object.prototype.hasOwnProperty.call(ref, "sizeBytes")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(ref, "expiresAt")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(ref, "metadata")).toBe(false);
  });
});

describe("fileRefFromStoragePath", () => {
  const minimal = {
    name: "report.pdf",
    mimeType: "application/pdf",
    storagePath: "user-1/workflow-1/run-1/node-1/report.pdf",
  };

  it("builds a `v2_storage` FileRef from the minimum inputs", () => {
    const ref = fileRefFromStoragePath(minimal);
    expect(ref.kind).toBe("v2_storage");
    expect(ref.storagePath).toBe(minimal.storagePath);
    expect(FileRefSchema.safeParse(ref).success).toBe(true);
  });

  it("accepts an optional diagnostic provider id", () => {
    const ref = fileRefFromStoragePath({ ...minimal, provider: "slack" });
    expect(ref.provider).toBe("slack");
  });

  it("sanitizes the file name", () => {
    const ref = fileRefFromStoragePath({ ...minimal, name: "  spaced.pdf  " });
    expect(ref.name).toBe("spaced.pdf");
  });

  it("throws ZodError on an empty storagePath", () => {
    expect(() =>
      fileRefFromStoragePath({ ...minimal, storagePath: "" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError on negative sizeBytes", () => {
    expect(() =>
      fileRefFromStoragePath({ ...minimal, sizeBytes: -1 }),
    ).toThrow(ZodError);
  });
});

describe("fileRefFromSignedUrl", () => {
  const minimal = {
    name: "report.pdf",
    mimeType: "application/pdf",
    url: "https://graph.microsoft.com/downloadUrl/abc",
  };

  it("builds a `signed_url` FileRef from the minimum inputs", () => {
    const ref = fileRefFromSignedUrl(minimal);
    expect(ref.kind).toBe("signed_url");
    expect(ref.url).toBe(minimal.url);
    expect(FileRefSchema.safeParse(ref).success).toBe(true);
  });

  it("includes expiresAt when supplied", () => {
    const ref = fileRefFromSignedUrl({
      ...minimal,
      expiresAt: "2026-05-12T02:00:00Z",
    });
    expect(ref.expiresAt).toBe("2026-05-12T02:00:00Z");
  });

  it("accepts an optional diagnostic provider id", () => {
    const ref = fileRefFromSignedUrl({
      ...minimal,
      provider: "microsoft-onedrive",
    });
    expect(ref.provider).toBe("microsoft-onedrive");
  });

  it("sanitizes the file name", () => {
    const ref = fileRefFromSignedUrl({ ...minimal, name: "../weird.pdf" });
    expect(ref.name).toBe("..weird.pdf");
  });

  it("throws ZodError on an invalid URL", () => {
    expect(() =>
      fileRefFromSignedUrl({ ...minimal, url: "ftp incomplete" }),
    ).toThrow(ZodError);
  });
});
