/**
 * @jest-environment node
 *
 * Tests for the Gmail create_draft config schema. The engine
 * pre-resolves every `{{...}}` reference before this schema runs;
 * validation here is defense-in-depth.
 *
 * Pattern mirrors `sendEmail.schema.test.ts` because create_draft
 * shares most of send_email's schema shape (minus `labels`).
 */
import { CreateDraftConfigSchema } from "@/integrations/gmail/actions/createDraft.schema";

describe("CreateDraftConfigSchema", () => {
  it("accepts a minimal valid config (textBody only)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "Hello there.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal valid config (htmlBody only)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      htmlBody: "<p>Hello.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both textBody and htmlBody", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "plain",
      htmlBody: "<p>html</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc and bcc as strings", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: "carbon@example.com",
      bcc: "blind@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc and bcc as string arrays (P-G2)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      cc: ["c1@x.com", "c2@x.com"],
      bcc: ["b1@x.com"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts to as a string array", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: ["alice@x.com", "bob@x.com"],
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("accepts empty subject string (matches send_email Slice 2d decision)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "",
      textBody: "x",
    });
    expect(r.success).toBe(true);
  });

  it("accepts replyTo + signature (shared with send_email Commit 2 expansion)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      replyTo: "noreply@example.com",
      signature: "— ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when `to` is missing", () => {
    const r = CreateDraftConfigSchema.safeParse({
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `to` is an empty string", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "",
      subject: "Hi",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when `subject` is missing (must be present, may be empty)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when neither textBody nor htmlBody is provided", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when both bodies are empty strings", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "",
      htmlBody: "",
    });
    expect(r.success).toBe(false);
  });

  // Q11 / strict-mode rejection — drafts must NOT accept the same
  // dropped fields as send_email.

  it("rejects scheduleSend (Q11 — silent no-op field dropped)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      scheduleSend: "2026-06-01T12:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects trackOpens / trackClicks", () => {
    expect(
      CreateDraftConfigSchema.safeParse({
        to: "alice@example.com",
        subject: "Hi",
        textBody: "x",
        trackOpens: true,
      }).success,
    ).toBe(false);
    expect(
      CreateDraftConfigSchema.safeParse({
        to: "alice@example.com",
        subject: "Hi",
        textBody: "x",
        trackClicks: true,
      }).success,
    ).toBe(false);
  });

  it("rejects attachments (DEFERRED to Gmail 2.3 / P-S3)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      attachments: [{ filename: "x.pdf", content: "..." }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects labels (labels-on-send is a send_email concern; drafts use add_label downstream)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      textBody: "x",
      labels: ["INBOX"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a V1-style single `body` field (no auto-detect)", () => {
    const r = CreateDraftConfigSchema.safeParse({
      to: "alice@example.com",
      subject: "Hi",
      body: "<p>HTML?</p>",
    });
    expect(r.success).toBe(false);
  });
});
