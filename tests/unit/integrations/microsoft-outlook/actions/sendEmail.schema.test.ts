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
});
