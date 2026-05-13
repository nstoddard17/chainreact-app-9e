/**
 * @jest-environment node
 *
 * Tests for the Gmail create_label config schema. Validates the
 * no-silent-default policy on visibility fields and the
 * both-colors-or-neither rule on the color object.
 */
import { CreateLabelConfigSchema } from "@/integrations/gmail/actions/createLabel.schema";

describe("CreateLabelConfigSchema", () => {
  it("accepts a minimal valid config (name only)", () => {
    const r = CreateLabelConfigSchema.safeParse({ name: "Imports" });
    expect(r.success).toBe(true);
  });

  it("accepts name + labelListVisibility", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "Imports",
      labelListVisibility: "labelShow",
    });
    expect(r.success).toBe(true);
  });

  it("accepts name + messageListVisibility", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "Imports",
      messageListVisibility: "hide",
    });
    expect(r.success).toBe(true);
  });

  it("accepts all three visibility-set variations", () => {
    const variants = [
      "labelShow",
      "labelShowIfUnread",
      "labelHide",
    ] as const;
    for (const v of variants) {
      const r = CreateLabelConfigSchema.safeParse({
        name: "X",
        labelListVisibility: v,
      });
      expect(r.success).toBe(true);
    }

    expect(
      CreateLabelConfigSchema.safeParse({
        name: "X",
        messageListVisibility: "show",
      }).success,
    ).toBe(true);
    expect(
      CreateLabelConfigSchema.safeParse({
        name: "X",
        messageListVisibility: "hide",
      }).success,
    ).toBe(true);
  });

  it("accepts a valid color object (both fields)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      color: {
        backgroundColor: "#16a766",
        textColor: "#ffffff",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects when name is missing", () => {
    expect(CreateLabelConfigSchema.safeParse({}).success).toBe(false);
  });

  it("rejects when name is empty string", () => {
    expect(
      CreateLabelConfigSchema.safeParse({ name: "" }).success,
    ).toBe(false);
  });

  it("rejects invalid labelListVisibility enum values", () => {
    expect(
      CreateLabelConfigSchema.safeParse({
        name: "X",
        labelListVisibility: "showAlways",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid messageListVisibility enum values", () => {
    expect(
      CreateLabelConfigSchema.safeParse({
        name: "X",
        messageListVisibility: "always",
      }).success,
    ).toBe(false);
  });

  it("rejects color object missing backgroundColor (V1 silent default dropped)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      color: { textColor: "#ffffff" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects color object missing textColor (V1 silent default dropped)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      color: { backgroundColor: "#434343" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects color object with empty-string fields", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      color: { backgroundColor: "", textColor: "" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown color sub-fields (strict object)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      color: {
        backgroundColor: "#16a766",
        textColor: "#ffffff",
        hex: "#ff0000",
      },
    });
    expect(r.success).toBe(false);
  });

  // V1 conflations + unknown fields rejected

  it("rejects V1 `labelName` (V2 uses `name`)", () => {
    const r = CreateLabelConfigSchema.safeParse({ labelName: "X" });
    expect(r.success).toBe(false);
  });

  it("rejects V1 `backgroundColor` at top level (V2 nests under color)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      backgroundColor: "#16a766",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    const r = CreateLabelConfigSchema.safeParse({
      name: "X",
      type: "user",
    });
    expect(r.success).toBe(false);
  });
});
