/**
 * @jest-environment node
 *
 * Tests for the add_categories config schema (Outlook Mail 2.2 Commit 2).
 * CSV-string-or-array accepted; min-1 enforced on each branch; strict
 * mode rejects unknowns. Whitespace-only post-parse is caught by the
 * handler, not the schema.
 */
import { AddCategoriesConfigSchema } from "@/integrations/microsoft-outlook/actions/addCategories.schema";

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
  categories: "Important",
};

describe("AddCategoriesConfigSchema", () => {
  it("accepts a single-category string", () => {
    expect(() => AddCategoriesConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a CSV string of multiple categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "Important, Urgent, Follow-up",
      }),
    ).not.toThrow();
  });

  it("accepts an array of strings", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["Important", "Urgent"],
      }),
    ).not.toThrow();
  });

  it("accepts a single-element array", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["Important"],
      }),
    ).not.toThrow();
  });

  it("accepts whitespace-only CSV at schema layer (handler catches it)", () => {
    // Schema-layer min(1) only catches "no value at all". The whitespace-
    // only path is caught by the handler after parseCsvList yields [].
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "   ,   ",
      }),
    ).not.toThrow();
  });

  it("rejects empty-string categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "",
      }),
    ).toThrow();
  });

  it("rejects empty-array categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: [],
      }),
    ).toThrow();
  });

  it("rejects missing categories", () => {
    const { categories: _c, ...rest } = VALID_CONFIG;
    expect(() => AddCategoriesConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => AddCategoriesConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects non-string non-array categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: { name: "x" } as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects array with non-string entries", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["a", 42 as unknown as string],
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("rejects boolean categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: true as unknown as string,
      }),
    ).toThrow();
  });
});
