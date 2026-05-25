import { FileRefSchema, FILE_REF_NAME_MAX_LENGTH } from "@/contracts/file";

const baseShared = {
  name: "report.pdf",
  mimeType: "application/pdf",
};

describe("FileRefSchema", () => {
  describe("provider_url arm", () => {
    const valid = {
      kind: "provider_url" as const,
      ...baseShared,
      url: "https://files.slack.com/files-pri/T1-F1/report.pdf",
      provider: "slack",
    };

    it("accepts the minimum required shape (kind + name + mimeType + url + provider)", () => {
      const r = FileRefSchema.safeParse(valid);
      expect(r.success).toBe(true);
    });

    it("accepts optional fields (sizeBytes, expiresAt, providerFileId, metadata)", () => {
      const r = FileRefSchema.safeParse({
        ...valid,
        sizeBytes: 1024,
        expiresAt: "2026-05-12T00:00:00Z",
        providerFileId: "F12345",
        metadata: { permalink: "https://example.com/p" },
      });
      expect(r.success).toBe(true);
    });

    it("rejects when `url` is missing", () => {
      const { url: _url, ...rest } = valid;
      const r = FileRefSchema.safeParse(rest);
      expect(r.success).toBe(false);
    });

    it("rejects when `provider` is missing", () => {
      const { provider: _p, ...rest } = valid;
      const r = FileRefSchema.safeParse(rest);
      expect(r.success).toBe(false);
    });

    it("rejects a malformed URL", () => {
      const r = FileRefSchema.safeParse({ ...valid, url: "not a url" });
      expect(r.success).toBe(false);
    });

    it("rejects a provider id that doesn't match the lowercase/dash/underscore format", () => {
      const r = FileRefSchema.safeParse({ ...valid, provider: "Slack" });
      expect(r.success).toBe(false);
    });

    it("rejects a `storagePath` field smuggled into the provider_url arm (strict)", () => {
      const r = FileRefSchema.safeParse({
        ...valid,
        storagePath: "some/path",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("v2_storage arm", () => {
    const valid = {
      kind: "v2_storage" as const,
      ...baseShared,
      storagePath: "user-1/workflow-1/run-1/node-1/report.pdf",
    };

    it("accepts the minimum required shape", () => {
      const r = FileRefSchema.safeParse(valid);
      expect(r.success).toBe(true);
    });

    it("accepts an optional diagnostic provider id", () => {
      const r = FileRefSchema.safeParse({ ...valid, provider: "slack" });
      expect(r.success).toBe(true);
    });

    it("rejects when `storagePath` is missing", () => {
      const { storagePath: _s, ...rest } = valid;
      const r = FileRefSchema.safeParse(rest);
      expect(r.success).toBe(false);
    });

    it("rejects an empty `storagePath`", () => {
      const r = FileRefSchema.safeParse({ ...valid, storagePath: "" });
      expect(r.success).toBe(false);
    });

    it("rejects a `url` field smuggled into the v2_storage arm (strict)", () => {
      const r = FileRefSchema.safeParse({
        ...valid,
        url: "https://example.com/x",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("signed_url arm", () => {
    const valid = {
      kind: "signed_url" as const,
      ...baseShared,
      url: "https://graph.microsoft.com/downloadUrl/abc",
    };

    it("accepts the minimum required shape", () => {
      const r = FileRefSchema.safeParse(valid);
      expect(r.success).toBe(true);
    });

    it("accepts an expiresAt", () => {
      const r = FileRefSchema.safeParse({
        ...valid,
        expiresAt: "2026-05-12T01:00:00Z",
      });
      expect(r.success).toBe(true);
    });

    it("rejects when `url` is missing", () => {
      const { url: _url, ...rest } = valid;
      const r = FileRefSchema.safeParse(rest);
      expect(r.success).toBe(false);
    });

    it("rejects a `storagePath` field smuggled into the signed_url arm (strict)", () => {
      const r = FileRefSchema.safeParse({
        ...valid,
        storagePath: "some/path",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("shared validation", () => {
    const minimal = {
      kind: "v2_storage" as const,
      name: "x.txt",
      mimeType: "text/plain",
      storagePath: "u/w/r/n/x.txt",
    };

    it("rejects when `name` is empty", () => {
      const r = FileRefSchema.safeParse({ ...minimal, name: "" });
      expect(r.success).toBe(false);
    });

    it(`rejects when \`name\` exceeds ${FILE_REF_NAME_MAX_LENGTH} chars`, () => {
      const tooLong = "a".repeat(FILE_REF_NAME_MAX_LENGTH + 1);
      const r = FileRefSchema.safeParse({ ...minimal, name: tooLong });
      expect(r.success).toBe(false);
    });

    it(`accepts a \`name\` at exactly ${FILE_REF_NAME_MAX_LENGTH} chars`, () => {
      const atLimit = "a".repeat(FILE_REF_NAME_MAX_LENGTH);
      const r = FileRefSchema.safeParse({ ...minimal, name: atLimit });
      expect(r.success).toBe(true);
    });

    it("rejects when `mimeType` is empty", () => {
      const r = FileRefSchema.safeParse({ ...minimal, mimeType: "" });
      expect(r.success).toBe(false);
    });

    it("rejects negative `sizeBytes`", () => {
      const r = FileRefSchema.safeParse({ ...minimal, sizeBytes: -1 });
      expect(r.success).toBe(false);
    });

    it("rejects non-integer `sizeBytes`", () => {
      const r = FileRefSchema.safeParse({ ...minimal, sizeBytes: 1.5 });
      expect(r.success).toBe(false);
    });

    it("accepts `sizeBytes: 0` (legitimate for empty files)", () => {
      const r = FileRefSchema.safeParse({ ...minimal, sizeBytes: 0 });
      expect(r.success).toBe(true);
    });

    it("rejects a non-ISO `expiresAt`", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        expiresAt: "next tuesday",
      });
      expect(r.success).toBe(false);
    });

    it("rejects unknown inline-byte fields (`content`)", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        content: "hello",
      });
      expect(r.success).toBe(false);
    });

    it("rejects unknown inline-byte fields (`bytes`)", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        bytes: [1, 2, 3],
      });
      expect(r.success).toBe(false);
    });

    it("rejects unknown inline-byte fields (`base64`)", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        base64: "aGVsbG8=",
      });
      expect(r.success).toBe(false);
    });

    it("rejects unknown inline-byte fields (`data`)", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        data: "raw",
      });
      expect(r.success).toBe(false);
    });

    it("rejects an unknown discriminator value (`inline_text`) — the antipattern arm we deliberately omitted", () => {
      const r = FileRefSchema.safeParse({
        ...minimal,
        kind: "inline_text",
        text: "hello",
      });
      expect(r.success).toBe(false);
    });
  });
});
