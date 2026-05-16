/**
 * @jest-environment node
 *
 * Tests for the move_email config schema (Outlook Mail 2.2 Commit 2).
 * Both fields required + non-empty; strict mode rejects unknowns.
 */
import { MoveEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/moveEmail.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
  destinationFolderId: "deleteditems",
};

describe("MoveEmailConfigSchema", () => {
  it("accepts the minimal valid config", () => {
    expect(() => MoveEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a custom folder id (not just well-known names)", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: "AQMkAGE-custom-folder-id",
      }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => MoveEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing destinationFolderId", () => {
    const { destinationFolderId: _d, ...rest } = VALID_CONFIG;
    expect(() => MoveEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string destinationFolderId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: "",
      }),
    ).toThrow();
  });

  it("rejects non-string emailId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        emailId: 42 as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects non-string destinationFolderId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: { id: "x" } as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("does NOT silently coerce types", () => {
    // Strict mode + explicit string schemas — no coercion.
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        emailId: true as unknown as string,
      }),
    ).toThrow();
  });
});
