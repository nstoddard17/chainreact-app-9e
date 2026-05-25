/**
 * @jest-environment node
 *
 * Tests for the create_draft_email config schema. Q11 — `isHtml` and
 * `importance` are REQUIRED with no hidden defaults. Schema mirrors
 * send_email exactly minus the send-side semantics.
 */
import { CreateDraftEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/createDraftEmail.schema";

const VALID_CONFIG = {
  to: "alice@example.test",
  subject: "Draft hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

describe("CreateDraftEmailConfigSchema", () => {
  it("accepts the minimal valid config (all required fields present)", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse(VALID_CONFIG),
    ).not.toThrow();
  });

  it("accepts to as a string", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: "a@x.com, b@x.com",
      }),
    ).not.toThrow();
  });

  it("accepts to as an array of strings", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: ["a@x.com", "b@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts cc and bcc as either string or array", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: "c@x.com",
        bcc: ["d@x.com"],
      }),
    ).not.toThrow();
  });

  it("allows empty subject (mirrors Gmail / send_email policy)", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({ ...VALID_CONFIG, subject: "" }),
    ).not.toThrow();
  });

  it("allows empty body", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({ ...VALID_CONFIG, body: "" }),
    ).not.toThrow();
  });

  it("rejects missing to", () => {
    const { to: _to, ...rest } = VALID_CONFIG;
    expect(() => CreateDraftEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string to", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({ ...VALID_CONFIG, to: "" }),
    ).toThrow();
  });

  it("rejects empty-array to", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({ ...VALID_CONFIG, to: [] }),
    ).toThrow();
  });

  it("rejects missing isHtml (Q11 — no hidden default)", () => {
    const { isHtml: _isHtml, ...rest } = VALID_CONFIG;
    expect(() => CreateDraftEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing importance (Q11 — no hidden default)", () => {
    const { importance: _importance, ...rest } = VALID_CONFIG;
    expect(() => CreateDraftEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing subject (must be present even if empty)", () => {
    const { subject: _subject, ...rest } = VALID_CONFIG;
    expect(() => CreateDraftEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing body (must be present even if empty)", () => {
    const { body: _body, ...rest } = VALID_CONFIG;
    expect(() => CreateDraftEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects invalid importance values", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({
        ...VALID_CONFIG,
        importance: "urgent",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      CreateDraftEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });
});
