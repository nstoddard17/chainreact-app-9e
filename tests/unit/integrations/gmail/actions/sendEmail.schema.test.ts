/**
 * @jest-environment node
 *
 * Tests for the Gmail send_email config schema. The engine has already
 * pre-resolved every `{{...}}` reference before this schema runs;
 * validation here is defense-in-depth.
 */
import { SendEmailConfigSchema } from "@/integrations/gmail/actions/sendEmail.schema";

describe("SendEmailConfigSchema", () => {
  it("accepts a minimal valid config (textBody only)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "Hello there.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal valid config (htmlBody only)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      htmlBody: "<p>Hello.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both textBody and htmlBody (multipart/alternative)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "plain",
      htmlBody: "<p>html</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc and bcc", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: "carbon@example.com",
      bcc: "blind@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty subject (additional Slice 2d decision)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when `to` is missing", () => {
    const r = SendEmailConfigSchema.safeParse({
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `to` is an empty string", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "",
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `subject` is missing (must be present, may be empty)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when neither textBody nor htmlBody is provided", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when both bodies are empty strings", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "",
      htmlBody: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      // Pick a name that's not in the schema and not in any Q11-rejected
      // set so this test stays focused on strict-mode itself.
      xCustomHeader: "value",
    });
    expect(r.success).toBe(false);
  });

  // Gmail 2.1 / P-G2 — recipient fields accept either CSV strings or
  // string arrays. Both shapes route through `parseRecipients` in the
  // handler.

  it("accepts `to` as a string array (P-G2)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: ["alice@example.com", "bob@example.com"],
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("accepts `cc` and `bcc` as string arrays (P-G2)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: ["carbon1@example.com", "carbon2@example.com"],
      bcc: ["blind@example.com"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects `to` as an empty array (P-G2 — min(1) on array)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: [],
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  // Gmail 2.1 Commit 2 — expansion: replyTo / signature / labels[]

  it("accepts replyTo (Gmail 2.1 Commit 2)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      replyTo: "noreply@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty-string replyTo (min(1) on optional string)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      replyTo: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts signature (Gmail 2.1 Commit 2)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      signature: "— Sent via ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty-string signature (min(1))", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      signature: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts labels as an array of non-empty label IDs (Gmail 2.1 Commit 2)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      labels: ["Label_123", "INBOX"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts labels as an empty array (no-op at handler — skips modify call)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      labels: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects labels containing an empty-string id (Zod min(1))", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      labels: ["INBOX", ""],
    });
    expect(r.success).toBe(false);
  });

  // Q11 — dropped fields must not be accepted (strict mode rejects unknown).

  it("rejects scheduleSend (Q11 — silent no-op field dropped)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      scheduleSend: "2026-06-01T12:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects trackOpens (Q11 — silent no-op field dropped)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      trackOpens: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects trackClicks (Q11 — silent no-op field dropped)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      trackClicks: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects attachments (DEFERRED — gated on P-S3 contract)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      attachments: [{ filename: "x.pdf", content: "..." }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a V1-style single `body` field (no auto-detect — keep textBody/htmlBody explicit)", () => {
    const r = SendEmailConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      body: "<p>HTML?</p>",
    });
    expect(r.success).toBe(false);
  });
});
