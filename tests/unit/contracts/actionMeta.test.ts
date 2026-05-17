/**
 * Unit tests for the ActionMeta Zod contract.
 *
 * Covers:
 *   - happy path: a minimal valid meta parses.
 *   - key invariant: key must equal `${provider}:${type}`.
 *   - field-name uniqueness within an action.
 *   - dependsOn pointing at an unknown field is rejected.
 *   - options + optionsSource cannot coexist.
 *   - options / optionsSource only valid on select/combobox.
 *   - numeric only valid on number; multiple only on select/combobox;
 *     keyValueMaxRows only on keyvalue.
 *   - strict mode rejects unknown top-level fields.
 *   - defaults: outputs / producesFileRef / consumesFileRef / displayOrder.
 */
import {
  ActionMetaSchema,
  FieldMetaSchema,
  OutputMetaSchema,
  type ActionMeta,
  type FieldMeta,
} from "@/contracts/actionMeta";

function validField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return FieldMetaSchema.parse({
    name: "fieldA",
    label: "Field A",
    type: "text",
    required: true,
    ...overrides,
  });
}

function validMeta(overrides: Partial<ActionMeta> = {}): unknown {
  return {
    key: "native:thing",
    provider: "native",
    type: "thing",
    displayName: "Thing",
    description: "Does a thing.",
    category: "other",
    requiresIntegration: false,
    fields: [validField()],
    ...overrides,
  };
}

describe("ActionMetaSchema — happy path", () => {
  it("parses a minimal valid meta", () => {
    const parsed = ActionMetaSchema.parse(validMeta());
    expect(parsed.key).toBe("native:thing");
    expect(parsed.outputs).toEqual([]);
    expect(parsed.producesFileRef).toBe(false);
    expect(parsed.consumesFileRef).toBe(false);
    expect(parsed.displayOrder).toBeNull();
  });

  it("accepts a meta with outputs, FileRef flags, and displayOrder", () => {
    const parsed = ActionMetaSchema.parse(
      validMeta({
        outputs: [{ name: "result", type: "string" }],
        producesFileRef: true,
        consumesFileRef: true,
        displayOrder: 5,
      }),
    );
    expect(parsed.outputs).toHaveLength(1);
    expect(parsed.producesFileRef).toBe(true);
    expect(parsed.consumesFileRef).toBe(true);
    expect(parsed.displayOrder).toBe(5);
  });
});

describe("ActionMetaSchema — key invariant", () => {
  it("rejects a meta whose key does not match provider:type", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({ key: "native:other" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/must equal/);
    }
  });

  it("rejects a malformed key string", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({ key: "Bad-Key", provider: "Bad-Key", type: "" }),
    );
    expect(result.success).toBe(false);
  });
});

describe("ActionMetaSchema — field-level invariants", () => {
  it("rejects duplicate field names", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({
        fields: [validField({ name: "x" }), validField({ name: "x" })],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects dependsOn referencing an unknown field", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({
        fields: [
          validField({ name: "a" }),
          validField({ name: "b", dependsOn: "ghost" }),
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/unknown field/);
    }
  });

  it("accepts dependsOn that points at a same-action field", () => {
    expect(() =>
      ActionMetaSchema.parse(
        validMeta({
          fields: [
            validField({ name: "parent", type: "select", options: [
              { value: "a", label: "A" },
            ] }),
            validField({ name: "child", dependsOn: "parent" }),
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe("FieldMetaSchema — type-specific constraints", () => {
  it("rejects options + optionsSource together", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "select",
      required: true,
      options: [{ value: "a", label: "A" }],
      optionsSource: "slack:channels",
    });
    expect(result.success).toBe(false);
  });

  it("rejects options on text fields", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: true,
      options: [{ value: "a", label: "A" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric on non-number fields", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: true,
      numeric: { min: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts numeric bounds on number fields", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "n",
        label: "N",
        type: "number",
        required: true,
        numeric: { min: 1, max: 30, integer: true, step: 1 },
      }),
    ).not.toThrow();
  });

  it("rejects multiple on non-select/combobox fields", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: true,
      multiple: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects keyValueMaxRows on non-keyvalue fields", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: true,
      keyValueMaxRows: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("ActionMetaSchema — strict mode", () => {
  it("rejects unknown top-level fields", () => {
    const result = ActionMetaSchema.safeParse({
      ...(validMeta() as object),
      surpriseField: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("OutputMetaSchema — recursive nested fields", () => {
  it("accepts a nested object output", () => {
    expect(() =>
      OutputMetaSchema.parse({
        name: "envelope",
        type: "object",
        fields: [
          { name: "id", type: "string" },
          {
            name: "user",
            type: "object",
            fields: [{ name: "email", type: "string" }],
          },
        ],
      }),
    ).not.toThrow();
  });
});
