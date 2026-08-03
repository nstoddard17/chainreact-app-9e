/** @jest-environment node */
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
  normalizeDependsOn,
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

// ─── Slice 4.BUILDER-OPTIONS-1 — multi-parent dependsOn ──────────────────────

describe("normalizeDependsOn helper", () => {
  it("returns [] for undefined", () => {
    expect(normalizeDependsOn(undefined)).toEqual([]);
  });
  it("wraps a single string into a one-element array", () => {
    expect(normalizeDependsOn("baseId")).toEqual(["baseId"]);
  });
  it("passes an array through unchanged", () => {
    expect(normalizeDependsOn(["baseId", "tableIdOrName"])).toEqual([
      "baseId",
      "tableIdOrName",
    ]);
  });
});

describe("FieldMetaSchema — dependsOn cardinality", () => {
  it("accepts a single-string dependsOn (backward compatible)", () => {
    const f = FieldMetaSchema.parse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: "parent",
      optionsSource: "x:y",
    });
    expect(f.dependsOn).toBe("parent");
  });

  it("accepts an array dependsOn with multiple parents", () => {
    const f = FieldMetaSchema.parse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: ["baseId", "tableIdOrName"],
      optionsSource: "airtable:fields",
    });
    expect(f.dependsOn).toEqual(["baseId", "tableIdOrName"]);
  });

  it("rejects an empty dependsOn array", () => {
    const result = FieldMetaSchema.safeParse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: [],
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dependsOn array above the 8-parent cap", () => {
    const result = FieldMetaSchema.safeParse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string entry inside a dependsOn array", () => {
    const result = FieldMetaSchema.safeParse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: ["baseId", ""],
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate entries inside a dependsOn array", () => {
    const result = FieldMetaSchema.safeParse({
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: ["baseId", "baseId"],
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/[Dd]uplicate/);
    }
  });

  it("rejects a field that depends on itself (single)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "self",
      label: "Self",
      type: "combobox",
      required: false,
      dependsOn: "self",
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/itself/);
    }
  });

  it("rejects a field that depends on itself (inside an array)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "self",
      label: "Self",
      type: "combobox",
      required: false,
      dependsOn: ["baseId", "self"],
      optionsSource: "x:y",
    });
    expect(result.success).toBe(false);
  });
});

describe("FieldMetaSchema — sensitivity (CS-1)", () => {
  it("omitting `sensitivity` parses (additive, default-absent)", () => {
    const f = validField();
    expect(f.sensitivity).toBeUndefined();
  });

  it.each(["secret", "connection", "recipient"] as const)(
    "accepts the valid sensitivity value %s",
    (value) => {
      const f = validField({ sensitivity: value });
      expect(f.sensitivity).toBe(value);
    },
  );

  it("rejects an unknown sensitivity value", () => {
    const result = FieldMetaSchema.safeParse({
      name: "x",
      label: "X",
      type: "text",
      required: false,
      sensitivity: "pii",
    });
    expect(result.success).toBe(false);
  });

  it("a sensitivity-bearing field round-trips through a full ActionMeta parse", () => {
    const parsed = ActionMetaSchema.parse(
      validMeta({ fields: [validField({ name: "to", sensitivity: "recipient" })] }),
    );
    expect(parsed.fields[0]!.sensitivity).toBe("recipient");
  });
});

describe("OutputMetaSchema — nullable output flag (honest output contract)", () => {
  it("omitting `nullable` parses (additive, default-absent = always present)", () => {
    const parsed = OutputMetaSchema.parse({ name: "cardId", type: "string" });
    expect(parsed.nullable).toBeUndefined();
  });

  it("accepts an output marked nullable (type names the shape WHEN present)", () => {
    const parsed = OutputMetaSchema.parse({
      name: "text",
      type: "string",
      nullable: true,
      sensitive: true,
    });
    expect(parsed.nullable).toBe(true);
    expect(parsed.type).toBe("string");
  });

  it("rejects a non-boolean nullable (strict)", () => {
    const result = OutputMetaSchema.safeParse({ name: "x", type: "string", nullable: "yes" });
    expect(result.success).toBe(false);
  });

  it("a nullable output round-trips through a full ActionMeta parse", () => {
    const parsed = ActionMetaSchema.parse(
      validMeta({ outputs: [{ name: "text", type: "string", nullable: true }] }),
    );
    expect(parsed.outputs[0]!.nullable).toBe(true);
  });
});

describe("ActionMetaSchema — multi-parent dependsOn cross-field validation", () => {
  it("accepts a field whose array dependsOn references known sibling fields", () => {
    expect(() =>
      ActionMetaSchema.parse(
        validMeta({
          fields: [
            validField({ name: "baseId" }),
            validField({ name: "tableIdOrName" }),
            validField({
              name: "fieldName",
              type: "combobox",
              dependsOn: ["baseId", "tableIdOrName"],
              optionsSource: "airtable:fields",
            }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an array dependsOn where one parent is an unknown field", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({
        fields: [
          validField({ name: "baseId" }),
          validField({
            name: "fieldName",
            type: "combobox",
            dependsOn: ["baseId", "ghostTable"],
            optionsSource: "airtable:fields",
          }),
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /unknown field/.test(i.message)),
      ).toBe(true);
    }
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

  it("accepts a string-array field (Slice 3.13)", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "from",
        label: "From",
        type: "string-array",
        required: false,
      }),
    ).not.toThrow();
  });

  it("accepts stringArrayMaxItems on a string-array field", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "from",
        label: "From",
        type: "string-array",
        required: false,
        stringArrayMaxItems: 10,
      }),
    ).not.toThrow();
  });

  it("accepts defaultValue: [] on a string-array field", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "from",
        label: "From",
        type: "string-array",
        required: false,
        defaultValue: [],
      }),
    ).not.toThrow();
  });

  it("accepts defaultValue: string[] (non-empty) on a string-array field", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "labelIds",
        label: "Labels",
        type: "string-array",
        required: false,
        defaultValue: ["INBOX"],
      }),
    ).not.toThrow();
  });

  it("rejects stringArrayMaxItems on a non-string-array field", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: false,
      stringArrayMaxItems: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects multiple: true on a string-array field (multiple stays select/combobox-only)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "from",
      label: "From",
      type: "string-array",
      required: false,
      multiple: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects stringArrayMaxItems above the 256 ceiling", () => {
    const result = FieldMetaSchema.safeParse({
      name: "from",
      label: "From",
      type: "string-array",
      required: false,
      stringArrayMaxItems: 257,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero / negative stringArrayMaxItems", () => {
    const zero = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "string-array",
      required: false,
      stringArrayMaxItems: 0,
    });
    expect(zero.success).toBe(false);
    const negative = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "string-array",
      required: false,
      stringArrayMaxItems: -1,
    });
    expect(negative.success).toBe(false);
  });

  // ─── Slice 3.21: file-array FieldType ────────────────────────────────────
  it("accepts a file-array field (Slice 3.21)", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "attachments",
        label: "Attachments",
        type: "file-array",
        required: false,
      }),
    ).not.toThrow();
  });

  it("accepts fileArrayMaxItems on a file-array field", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "attachments",
        label: "Attachments",
        type: "file-array",
        required: false,
        fileArrayMaxItems: 25,
      }),
    ).not.toThrow();
  });

  it("rejects fileArrayMaxItems on a non-file-array field", () => {
    const result = FieldMetaSchema.safeParse({
      name: "f",
      label: "F",
      type: "text",
      required: false,
      fileArrayMaxItems: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/file-array/);
    }
  });

  it("rejects fileArrayMaxItems on a string-array field (each array type owns its own cap key)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "from",
      label: "From",
      type: "string-array",
      required: false,
      fileArrayMaxItems: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects stringArrayMaxItems on a file-array field (cap keys do not cross over)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      stringArrayMaxItems: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fileArrayMaxItems above the 64 ceiling", () => {
    const result = FieldMetaSchema.safeParse({
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      fileArrayMaxItems: 65,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero / negative fileArrayMaxItems", () => {
    const zero = FieldMetaSchema.safeParse({
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      fileArrayMaxItems: 0,
    });
    expect(zero.success).toBe(false);
    const negative = FieldMetaSchema.safeParse({
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      fileArrayMaxItems: -1,
    });
    expect(negative.success).toBe(false);
  });

  it("rejects multiple: true on a file-array field (multiple stays select/combobox-only)", () => {
    const result = FieldMetaSchema.safeParse({
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      multiple: true,
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

describe("ActionMetaSchema — Slice 3.SEC-2A risk flags", () => {
  it("applies low-risk defaults when no risk fields are present", () => {
    const parsed = ActionMetaSchema.parse(validMeta());
    expect(parsed.isDestructive).toBe(false);
    expect(parsed.requiresConfirmation).toBe(false);
    expect(parsed.riskLevel).toBe("low");
    expect(parsed.riskDescription).toBeUndefined();
  });

  it("accepts the full risk-field set on a high-risk action", () => {
    const parsed = ActionMetaSchema.parse(
      validMeta({
        isDestructive: true,
        requiresConfirmation: true,
        riskLevel: "high",
        riskDescription: "Permanent delete; not recoverable.",
      }),
    );
    expect(parsed.isDestructive).toBe(true);
    expect(parsed.requiresConfirmation).toBe(true);
    expect(parsed.riskLevel).toBe("high");
    expect(parsed.riskDescription).toBe("Permanent delete; not recoverable.");
  });

  it("accepts riskLevel medium without destructive/confirmation flags", () => {
    const parsed = ActionMetaSchema.parse(
      validMeta({ riskLevel: "medium" }),
    );
    expect(parsed.riskLevel).toBe("medium");
    expect(parsed.isDestructive).toBe(false);
    expect(parsed.requiresConfirmation).toBe(false);
  });

  it("rejects an invalid riskLevel value", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({ riskLevel: "extreme" as unknown as "low" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a riskDescription longer than 512 characters", () => {
    const tooLong = "x".repeat(513);
    const result = ActionMetaSchema.safeParse(
      validMeta({ riskDescription: tooLong }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a riskDescription up to 512 characters", () => {
    const ok = "x".repeat(512);
    const result = ActionMetaSchema.safeParse(
      validMeta({ riskDescription: ok }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects isDestructive: true paired with non-high riskLevel (consistency guard)", () => {
    const lowRisk = ActionMetaSchema.safeParse(
      validMeta({ isDestructive: true, riskLevel: "low" }),
    );
    expect(lowRisk.success).toBe(false);
    if (!lowRisk.success) {
      expect(lowRisk.error.issues[0]?.path).toEqual(["riskLevel"]);
    }
    const mediumRisk = ActionMetaSchema.safeParse(
      validMeta({ isDestructive: true, riskLevel: "medium" }),
    );
    expect(mediumRisk.success).toBe(false);
  });

  it("rejects requiresConfirmation: true paired with non-high riskLevel", () => {
    const lowRisk = ActionMetaSchema.safeParse(
      validMeta({ requiresConfirmation: true, riskLevel: "low" }),
    );
    expect(lowRisk.success).toBe(false);
    const mediumRisk = ActionMetaSchema.safeParse(
      validMeta({ requiresConfirmation: true, riskLevel: "medium" }),
    );
    expect(mediumRisk.success).toBe(false);
  });

  it("accepts isDestructive: true when paired with riskLevel: high", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({ isDestructive: true, riskLevel: "high" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts requiresConfirmation: true when paired with riskLevel: high", () => {
    const result = ActionMetaSchema.safeParse(
      validMeta({ requiresConfirmation: true, riskLevel: "high" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects unknown values via strict mode (catches typos like `riskLeval`)", () => {
    const result = ActionMetaSchema.safeParse({
      ...(validMeta() as object),
      riskLeval: "high",
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

describe("OutputMetaSchema — Slice 3.SEC-7 sensitive flag", () => {
  it("accepts sensitive: true on a top-level output", () => {
    // Synthetic output name; not tied to any real provider field.
    const parsed = OutputMetaSchema.parse({
      name: "apiToken",
      type: "string",
      description: "Synthetic example of a sensitive output.",
      sensitive: true,
    });
    expect(parsed.sensitive).toBe(true);
  });

  it("accepts sensitive: false explicitly (== default)", () => {
    const parsed = OutputMetaSchema.parse({
      name: "paymentIntentId",
      type: "string",
      sensitive: false,
    });
    expect(parsed.sensitive).toBe(false);
  });

  it("treats omitted sensitive as undefined (consumers coerce to non-sensitive)", () => {
    const parsed = OutputMetaSchema.parse({
      name: "paymentIntentId",
      type: "string",
    });
    expect(parsed.sensitive).toBeUndefined();
  });

  it("accepts sensitive on a nested field inside fields[]", () => {
    const parsed = OutputMetaSchema.parse({
      name: "envelope",
      type: "object",
      fields: [
        { name: "id", type: "string" },
        { name: "customerEmail", type: "string", sensitive: true },
      ],
    });
    expect(parsed.fields?.[1]?.sensitive).toBe(true);
  });

  it("rejects sensitive: 'true' (string — must be boolean)", () => {
    const result = OutputMetaSchema.safeParse({
      name: "x",
      type: "string",
      sensitive: "true",
    });
    expect(result.success).toBe(false);
  });

  it("rejects sensitive: 1 (number — must be boolean)", () => {
    const result = OutputMetaSchema.safeParse({
      name: "x",
      type: "string",
      sensitive: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown sibling keys via strict mode (defense against typos like `senstive`)", () => {
    const result = OutputMetaSchema.safeParse({
      name: "x",
      type: "string",
      senstive: true,
    });
    expect(result.success).toBe(false);
  });
});
