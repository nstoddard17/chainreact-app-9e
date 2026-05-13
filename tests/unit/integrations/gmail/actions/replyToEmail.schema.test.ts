/**
 * @jest-environment node
 *
 * Tests for the Gmail reply_to_email config schema. Shape mirrors
 * createDraftReply — same inputs, different terminal API. Tests
 * assert the same accept/reject contract.
 */
import { ReplyToEmailConfigSchema } from "@/integrations/gmail/actions/replyToEmail.schema";

describe("ReplyToEmailConfigSchema", () => {
  it("accepts a minimal valid config (originalMessageId + textBody)", () => {
    const r = ReplyToEmailConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "My reply.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts htmlBody only", () => {
    const r = ReplyToEmailConfigSchema.safeParse({
      originalMessageId: "msg-1",
      htmlBody: "<p>Reply.</p>",
    });
    expect(r.success).toBe(true);
  });

  it("accepts optional subject override + replyTo + signature", () => {
    const r = ReplyToEmailConfigSchema.safeParse({
      originalMessageId: "msg-1",
      textBody: "x",
      subject: "Custom subject",
      replyTo: "noreply@example.com",
      signature: "— ChainReact",
    });
    expect(r.success).toBe(true);
  });

  it("accepts cc + bcc as strings OR arrays (P-G2)", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        cc: "c@x.com",
        bcc: ["b@x.com"],
      }).success,
    ).toBe(true);
  });

  it("rejects when originalMessageId is missing or empty", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({ textBody: "x" }).success,
    ).toBe(false);
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "",
        textBody: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects when no body provided", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({ originalMessageId: "msg-1" })
        .success,
    ).toBe(false);
  });

  it("rejects threadId override (V2 always uses lookup-derived threadId)", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        threadId: "thr-explicit",
      }).success,
    ).toBe(false);
  });

  it("rejects replyAll (deferred — V1 logic was unclean)", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        replyAll: true,
      }).success,
    ).toBe(false);
  });

  it("rejects attachments (DEFERRED to Gmail 2.3 / P-S3)", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        attachments: [],
      }).success,
    ).toBe(false);
  });

  it("rejects labels (labels-on-send is sendEmail's surface; if needed, chain add_label downstream)", () => {
    expect(
      ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        labels: ["INBOX"],
      }).success,
    ).toBe(false);
  });

  it("rejects scheduleSend / trackOpens / trackClicks (Q11)", () => {
    for (const dropped of ["scheduleSend", "trackOpens", "trackClicks"] as const) {
      const r = ReplyToEmailConfigSchema.safeParse({
        originalMessageId: "msg-1",
        textBody: "x",
        [dropped]: true,
      });
      expect(r.success).toBe(false);
    }
  });
});
