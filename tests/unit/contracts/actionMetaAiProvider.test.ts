/** @jest-environment node */
/**
 * Contract additions for the ChainReact AI provider (AI-PROVIDER-4 CS-4):
 * the `ai` category, the `schema-fields` FieldType, and the
 * `dynamicOutputs` declaration + its referential integrity.
 */
import {
  ActionCategorySchema,
  ActionMetaSchema,
  DynamicOutputsDeclarationSchema,
  FieldTypeSchema,
} from "@/contracts/actionMeta";

function meta(overrides: Record<string, unknown> = {}) {
  return {
    key: "ai:analyze_document",
    provider: "ai",
    type: "analyze_document",
    displayName: "Analyze Document",
    description: "Read a document and return structured data.",
    category: "ai",
    requiresIntegration: false,
    fields: [
      { name: "mode", label: "Mode", type: "select", required: true },
      { name: "expectedFields", label: "Fields to extract", type: "schema-fields", required: true },
    ],
    outputs: [
      { name: "fields", type: "object" },
      { name: "rows", type: "array" },
      { name: "summary", type: "string" },
    ],
    ...overrides,
  };
}

describe("ai category", () => {
  it("is a first-class category (never falls back to other)", () => {
    expect(ActionCategorySchema.options).toContain("ai");
    expect(ActionCategorySchema.safeParse("ai").success).toBe(true);
    expect(ActionMetaSchema.parse(meta()).category).toBe("ai");
  });

  it("did not disturb the existing categories", () => {
    for (const existing of ["logic", "transform", "data", "http", "other"]) {
      expect(ActionCategorySchema.options).toContain(existing);
    }
  });
});

describe("schema-fields FieldType", () => {
  it("is accepted as a field type", () => {
    expect(FieldTypeSchema.options).toContain("schema-fields");
    expect(ActionMetaSchema.safeParse(meta()).success).toBe(true);
  });
});

describe("dynamicOutputs declaration", () => {
  const valid = [
    {
      configField: "expectedFields",
      attachUnder: "fields",
      whenField: "mode",
      whenValueIn: ["extract_fields"],
    },
  ];

  it("is optional — existing metas parse unchanged", () => {
    const parsed = ActionMetaSchema.parse(meta());
    expect(parsed.dynamicOutputs).toBeUndefined();
  });

  it("accepts a well-formed declaration", () => {
    const parsed = ActionMetaSchema.parse(meta({ dynamicOutputs: valid }));
    expect(parsed.dynamicOutputs).toEqual(valid);
  });

  it("accepts an ungated declaration (no whenField)", () => {
    expect(
      ActionMetaSchema.safeParse(
        meta({ dynamicOutputs: [{ configField: "expectedFields", attachUnder: "rows" }] }),
      ).success,
    ).toBe(true);
  });

  it("rejects whenValueIn without whenField", () => {
    const result = DynamicOutputsDeclarationSchema.safeParse({
      configField: "expectedFields",
      attachUnder: "fields",
      whenValueIn: ["extract_fields"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown configField", () => {
    expect(
      ActionMetaSchema.safeParse(
        meta({ dynamicOutputs: [{ configField: "nope", attachUnder: "fields" }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects a configField that is not a schema-fields editor", () => {
    const result = ActionMetaSchema.safeParse(
      meta({ dynamicOutputs: [{ configField: "mode", attachUnder: "fields" }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("schema-fields");
    }
  });

  it("rejects an unknown attachUnder output", () => {
    expect(
      ActionMetaSchema.safeParse(
        meta({ dynamicOutputs: [{ configField: "expectedFields", attachUnder: "ghost" }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects attaching under a scalar output (no children to synthesize)", () => {
    const result = ActionMetaSchema.safeParse(
      meta({ dynamicOutputs: [{ configField: "expectedFields", attachUnder: "summary" }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("object");
    }
  });

  it("rejects an unknown whenField", () => {
    expect(
      ActionMetaSchema.safeParse(
        meta({
          dynamicOutputs: [
            { configField: "expectedFields", attachUnder: "fields", whenField: "ghost" },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects two declarations for the SAME output (ambiguous source)", () => {
    const result = ActionMetaSchema.safeParse(
      meta({
        dynamicOutputs: [
          { configField: "expectedFields", attachUnder: "fields", whenField: "mode" },
          { configField: "expectedFields", attachUnder: "fields" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("allows two declarations targeting DIFFERENT outputs", () => {
    expect(
      ActionMetaSchema.safeParse(
        meta({
          dynamicOutputs: [
            { configField: "expectedFields", attachUnder: "fields" },
            { configField: "expectedFields", attachUnder: "rows" },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an empty declaration array and unknown keys", () => {
    expect(ActionMetaSchema.safeParse(meta({ dynamicOutputs: [] })).success).toBe(false);
    expect(
      DynamicOutputsDeclarationSchema.safeParse({
        configField: "a",
        attachUnder: "b",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
