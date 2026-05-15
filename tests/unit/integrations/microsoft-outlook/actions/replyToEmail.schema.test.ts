/**
 * @jest-environment node
 *
 * Tests for the reply_to_email config schema. Q11 contract — `replyAll`
 * is REQUIRED with no hidden default; `emailId` must be non-empty;
 * `body` must be present (may be empty); strict mode rejects unknowns.
 */
import { ReplyToEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/replyToEmail.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2abc",
  replyAll: false,
  body: "Got it",
};

describe("ReplyToEmailConfigSchema", () => {
  it("accepts the minimal valid config (all required fields present)", () => {
    expect(() => ReplyToEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts replyAll=true", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, replyAll: true }),
    ).not.toThrow();
  });

  it("allows empty body (mirrors send_email policy)", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, body: "" }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing replyAll (Q11 — no hidden default)", () => {
    const { replyAll: _replyAll, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects non-boolean replyAll", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({
        ...VALID_CONFIG,
        replyAll: "true",
      }),
    ).toThrow();
  });

  it("rejects missing body (must be present even if empty)", () => {
    const { body: _body, ...rest } = VALID_CONFIG;
    expect(() => ReplyToEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ReplyToEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });
});
