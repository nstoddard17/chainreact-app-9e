/**
 * @jest-environment node
 *
 * Tests for the Gmail create_draft_reply config schema.
 */
import { CreateDraftReplyConfigSchema } from "@/integrations/gmail/actions/createDraftReply.schema";

describe("CreateDraftReplyConfigSchema", () => {
  it("accepts a minimal valid config (originalMessageId + textBody)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "My reply.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts htmlBody only", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      htmlBody: "<p>Reply.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both bodies (multipart/alternative reply)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "Plain.",
      htmlBody: "<p>HTML.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional subject override", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      subject: "Custom Re: subject",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc + bcc as strings OR arrays (P-G2)", () => {
    expect(
      CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        cc: "c@x.com",
        bcc: "b@x.com",
      }).success,
    ).toBe(true);
    expect(
      CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        cc: ["c1@x.com", "c2@x.com"],
        bcc: ["b1@x.com"],
      }).success,
    ).toBe(true);
  });

  it("accepts replyTo + signature", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      replyTo: "noreply@example.com",
      signature: "— ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when originalMessageId is missing", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when originalMessageId is empty string", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "",
      textBody: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when no body provided", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when both bodies are empty strings", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "",
      htmlBody: "",
    });
    expect(r.success).toBe(false);
  });

  // Dropped fields — strict mode rejects.

  it("rejects threadId override (V2 always uses lookup-derived threadId)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      threadId: "thr-explicit",
    });
    expect(r.success).toBe(false);
  });

  it("rejects replyAll (deferred — V1 logic was unclean)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      replyAll: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects attachments (DEFERRED to Gmail 2.3 / P-S3)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      attachments: [{ filename: "x.pdf" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects labels (drafts don't take labels-on-send)", () => {
    const r = CreateDraftReplyConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      labels: ["INBOX"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects scheduleSend / trackOpens / trackClicks", () => {
    for (const dropped of ["scheduleSend", "trackOpens", "trackClicks"] as const) {
      const r = CreateDraftReplyConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        [dropped]: true,
      });
      expect(r.success).toBe(false);
    }
  });
});
