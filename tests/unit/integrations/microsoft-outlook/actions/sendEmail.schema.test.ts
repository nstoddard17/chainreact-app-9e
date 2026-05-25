/**
 * @jest-environment node
 *
 * Tests for the send_email config schema. Q11 contract — `isHtml` and
 * `importance` are REQUIRED with no hidden defaults; subject/body must
 * be present even if empty; `to` is required and accepts string OR array;
 * cc/bcc are optional; strict mode rejects unknowns.
 */
import { SendEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/sendEmail.schema";

const VALID_CONFIG = {
  to: "alice@example.test",
  subject: "Hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

describe("SendEmailConfigSchema", () => {
  it("accepts the minimal valid config (all required fields present)", () => {
    expect(() => SendEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts to as a string", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: "a@x.com, b@x.com",
      }),
    ).not.toThrow();
  });

  it("accepts to as an array of strings", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: ["a@x.com", "b@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts cc and bcc as either string or array", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: "c@x.com",
        bcc: ["d@x.com"],
      }),
    ).not.toThrow();
  });

  it("allows empty subject (mirrors Gmail policy — Microsoft accepts no-subject)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, subject: "" }),
    ).not.toThrow();
  });

  it("allows empty body", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, body: "" }),
    ).not.toThrow();
  });

  it("rejects missing to (Gmail-style required-recipient policy)", () => {
    const { to: _to, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty string to", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, to: "" }),
    ).toThrow();
  });

  it("rejects empty array to", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, to: [] }),
    ).toThrow();
  });

  it("rejects missing isHtml (Q11 — no hidden default)", () => {
    const { isHtml: _isHtml, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing importance (Q11 — no hidden default)", () => {
    const { importance: _importance, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing subject (must be present even if empty)", () => {
    const { subject: _subject, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing body (must be present even if empty)", () => {
    const { body: _body, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects invalid importance values", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        importance: "urgent",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  // ── Outlook Mail 2.1 Commit 4 — attachments field ─────────────────────

  it("accepts a config with attachments absent", () => {
    expect(() => SendEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a config with an empty attachments array", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, attachments: [] }),
    ).not.toThrow();
  });

  it("accepts a valid v2_storage FileRef in attachments", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "v2_storage",
            name: "invoice.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12345,
            storagePath: "u/wf/r/n/invoice.pdf",
            provider: "slack",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a valid signed_url FileRef in attachments", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "signed_url",
            name: "report.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            url: "https://example.test/signed-url-123",
            expiresAt: "2026-05-15T12:00:00Z",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a valid provider_url FileRef at the schema layer (handler rejects)", () => {
    // The schema layer can't reject provider_url — it's a valid FileRef
    // shape. The handler rejects this kind with UnsupportedProviderFetchError
    // before any Graph call. This is exercised in the handler tests.
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "provider_url",
            name: "thing.png",
            mimeType: "image/png",
            url: "https://files.slack.com/x/y/z",
            provider: "slack",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects inline-bytes attachment shape (content / bytes / base64 / data)", () => {
    // FileRefSchema's strict-arms reject any unknown field — confirms
    // the contract enforces "no inline bytes in action inputs."
    const inlineShapes = [
      { content: "raw" },
      { bytes: [1, 2, 3] },
      { base64: "Zm9v" },
      { data: "{...}" },
    ];
    for (const inline of inlineShapes) {
      expect(() =>
        SendEmailConfigSchema.parse({
          ...VALID_CONFIG,
          attachments: [
            {
              kind: "v2_storage",
              name: "x.txt",
              mimeType: "text/plain",
              storagePath: "u/wf/r/n/x.txt",
              ...inline,
            },
          ],
        }),
      ).toThrow();
    }
  });

  it("rejects an attachment with an unknown kind", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "magical",
            name: "x.txt",
            mimeType: "text/plain",
          } as unknown as Record<string, unknown>,
        ],
      }),
    ).toThrow();
  });

  it("rejects an attachment missing required FileRef fields (name / mimeType / discriminator)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "v2_storage",
            // missing name
            mimeType: "text/plain",
            storagePath: "u/wf/r/n/x.txt",
          } as unknown as Record<string, unknown>,
        ],
      }),
    ).toThrow();
  });
});
