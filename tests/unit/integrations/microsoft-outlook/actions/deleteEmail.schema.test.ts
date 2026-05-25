/**
 * @jest-environment node
 *
 * Tests for the delete_email config schema (Outlook Mail 2.2 Commit 2).
 * Q11 deleteMode required — no destructive default; strict enum only.
 */
import { DeleteEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/deleteEmail.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
  deleteMode: "trash" as const,
};

describe("DeleteEmailConfigSchema", () => {
  it("accepts deleteMode = 'trash'", () => {
    expect(() => DeleteEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts deleteMode = 'permanent'", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: "permanent",
      }),
    ).not.toThrow();
  });

  it("rejects missing deleteMode (Q11 — no hidden default)", () => {
    const { deleteMode: _d, ...rest } = VALID_CONFIG;
    expect(() => DeleteEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects boolean true (legacy V1 shape)", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: true as unknown as "trash",
      }),
    ).toThrow();
  });

  it("rejects boolean false (legacy V1 shape default)", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: false as unknown as "trash",
      }),
    ).toThrow();
  });

  it("rejects boolean-string 'true' (legacy V1 coercion)", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: "true" as unknown as "trash",
      }),
    ).toThrow();
  });

  it("rejects boolean-string 'false' (legacy V1 coercion)", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: "false" as unknown as "trash",
      }),
    ).toThrow();
  });

  it("rejects unknown deleteMode value", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        deleteMode: "archive" as unknown as "trash",
      }),
    ).toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => DeleteEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        permanentDelete: true,
      }),
    ).toThrow();
  });

  it("rejects unknown extra fields even when valid", () => {
    expect(() =>
      DeleteEmailConfigSchema.parse({
        ...VALID_CONFIG,
        leak: "yes",
      }),
    ).toThrow();
  });
});
