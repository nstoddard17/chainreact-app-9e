/**
 * @jest-environment node
 *
 * Tests for the forward_email config schema. Q7 — `to` and `cc` accept
 * CSV string or array; `cc` and `comment` are optional; `emailId` and
 * `to` are required; strict mode rejects unknowns.
 *
 * Note: at-least-one parsed `to` recipient is enforced by the handler
 * AFTER `parseRecipients` runs (whitespace-only CSV parses to []). The
 * schema's `.min(1)` only catches "no value at all" / "[]" / "''".
 */
import { ForwardEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/forwardEmail.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2abc",
  to: "alice@example.test",
};

describe("ForwardEmailConfigSchema", () => {
  it("accepts the minimal valid config (emailId + to)", () => {
    expect(() => ForwardEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts to as a CSV string", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: "a@x.com, b@x.com",
      }),
    ).not.toThrow();
  });

  it("accepts to as an array of strings", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: ["a@x.com", "b@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts cc as string or array (optional)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: "c@x.com",
      }),
    ).not.toThrow();
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: ["c@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts comment when supplied (optional)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        comment: "FYI",
      }),
    ).not.toThrow();
  });

  it("accepts empty-string comment", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, comment: "" }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => ForwardEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing to", () => {
    const { to: _to, ...rest } = VALID_CONFIG;
    expect(() => ForwardEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string to", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, to: "" }),
    ).toThrow();
  });

  it("rejects empty-array to", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({ ...VALID_CONFIG, to: [] }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ForwardEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });
});
