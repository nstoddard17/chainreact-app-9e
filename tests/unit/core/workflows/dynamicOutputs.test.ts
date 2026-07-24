/**
 * Tests for core/workflows/dynamicOutputs.ts (AI-PROVIDER-8 CS-8).
 *
 * The synthesis half of the CS-4 `dynamicOutputs` contract: static meta +
 * committed node config → the effective output tree. Uses the REAL shipped
 * AI metas (the contract's only current consumers) plus hand-built metas
 * for the failure/edge matrix. No mocks — the helper is pure.
 */
import { applyDynamicOutputs } from "@/core/workflows/dynamicOutputs";
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";
import { transformDataMeta } from "@/integrations/ai/actions/transformData.meta";
import type { ActionMeta } from "@/contracts/actionMeta";

const EXTRACT_FIELDS_CONFIG = {
  mode: "extract_fields",
  expectedFields: {
    fields: [
      { name: "employee_name", type: "string", required: true },
      { name: "gross_pay", type: "currency", description: "Gross pay." },
      { name: "hire_date", type: "date" },
      { name: "is_active", type: "boolean" },
      { name: "hours", type: "number" },
    ],
  },
};

function outputByName(outputs: readonly { name: string }[], name: string) {
  return outputs.find((o) => o.name === name) as
    | import("@/contracts/actionMeta").OutputMeta
    | undefined;
}

describe("applyDynamicOutputs — identity fast paths", () => {
  it("returns meta.outputs BY REFERENCE when the meta declares no dynamicOutputs", () => {
    const meta: ActionMeta = {
      ...analyzeDocumentMeta,
      dynamicOutputs: undefined,
    };
    expect(applyDynamicOutputs(meta, EXTRACT_FIELDS_CONFIG)).toBe(meta.outputs);
  });

  it("returns meta.outputs by reference when no declaration gate matches (summarize mode)", () => {
    const result = applyDynamicOutputs(analyzeDocumentMeta, {
      mode: "summarize",
      expectedFields: EXTRACT_FIELDS_CONFIG.expectedFields,
    });
    expect(result).toBe(analyzeDocumentMeta.outputs);
  });

  it("falls back to the field's defaultValue when the gate field is uncommitted (mode defaults to summarize → inert)", () => {
    const result = applyDynamicOutputs(analyzeDocumentMeta, {
      expectedFields: EXTRACT_FIELDS_CONFIG.expectedFields,
    });
    expect(result).toBe(analyzeDocumentMeta.outputs);
  });

  it("returns meta.outputs by reference when config is undefined entirely", () => {
    expect(applyDynamicOutputs(analyzeDocumentMeta, undefined)).toBe(
      analyzeDocumentMeta.outputs,
    );
  });
});

describe("applyDynamicOutputs — Analyze Document (real meta)", () => {
  it("attaches the author's schema fields under `fields` in extract_fields mode", () => {
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, EXTRACT_FIELDS_CONFIG);
    const fields = outputByName(outputs, "fields");
    expect(fields?.fields?.map((f) => f.name)).toEqual([
      "employee_name",
      "gross_pay",
      "hire_date",
      "is_active",
      "hours",
    ]);
  });

  it("maps user-schema types to fully-typed OutputTypes (currency→number, date→string)", () => {
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, EXTRACT_FIELDS_CONFIG);
    const children = outputByName(outputs, "fields")!.fields!;
    expect(children.map((c) => [c.name, c.type])).toEqual([
      ["employee_name", "string"],
      ["gross_pay", "number"],
      ["hire_date", "string"],
      ["is_active", "boolean"],
      ["hours", "number"],
    ]);
  });

  it("carries the author's field description through; omits absent descriptions", () => {
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, EXTRACT_FIELDS_CONFIG);
    const children = outputByName(outputs, "fields")!.fields!;
    expect(children.find((c) => c.name === "gross_pay")?.description).toBe(
      "Gross pay.",
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        children.find((c) => c.name === "employee_name"),
        "description",
      ),
    ).toBe(false);
  });

  it("attaches row columns under `rows` in extract_rows mode — and NOT under `fields`", () => {
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, {
      mode: "extract_rows",
      rowSchema: {
        fields: [
          { name: "item", type: "string" },
          { name: "amount", type: "currency" },
        ],
      },
    });
    expect(outputByName(outputs, "rows")?.fields?.map((f) => f.name)).toEqual([
      "item",
      "amount",
    ]);
    expect(outputByName(outputs, "fields")?.fields).toBeUndefined();
  });

  it("keeps every untouched output at its original identity, and never mutates meta.outputs", () => {
    const before = analyzeDocumentMeta.outputs.map((o) => o);
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, EXTRACT_FIELDS_CONFIG);
    for (const output of outputs) {
      if (output.name === "fields") continue;
      expect(output).toBe(outputByName(analyzeDocumentMeta.outputs, output.name));
    }
    // Same order, same names, source untouched.
    expect(outputs.map((o) => o.name)).toEqual(before.map((o) => o.name));
    expect(outputByName(analyzeDocumentMeta.outputs, "fields")!.fields).toBeUndefined();
  });

  it("stale outputs disappear: removing a schema field removes its child on the next synthesis", () => {
    const withField = applyDynamicOutputs(analyzeDocumentMeta, EXTRACT_FIELDS_CONFIG);
    expect(
      outputByName(withField, "fields")!.fields!.some((f) => f.name === "hours"),
    ).toBe(true);

    const shrunk = {
      ...EXTRACT_FIELDS_CONFIG,
      expectedFields: {
        fields: EXTRACT_FIELDS_CONFIG.expectedFields.fields.filter(
          (f) => f.name !== "hours",
        ),
      },
    };
    const without = applyDynamicOutputs(analyzeDocumentMeta, shrunk);
    expect(
      outputByName(without, "fields")!.fields!.some((f) => f.name === "hours"),
    ).toBe(false);
  });

  it("children follow the schema's row order — reordering rows reorders outputs", () => {
    const reversed = {
      mode: "extract_fields",
      expectedFields: {
        fields: [...EXTRACT_FIELDS_CONFIG.expectedFields.fields].reverse(),
      },
    };
    const outputs = applyDynamicOutputs(analyzeDocumentMeta, reversed);
    expect(outputByName(outputs, "fields")!.fields!.map((f) => f.name)).toEqual([
      "hours",
      "is_active",
      "hire_date",
      "gross_pay",
      "employee_name",
    ]);
  });
});

describe("applyDynamicOutputs — Transform Data (real meta)", () => {
  const CUSTOM_CONFIG = {
    destinationMode: "custom",
    destinationSchema: {
      fields: [
        { name: "subject", type: "string", required: true },
        { name: "amount_due", type: "currency" },
      ],
    },
  };

  it("attaches the custom schema under BOTH `rows` and `record`", () => {
    const outputs = applyDynamicOutputs(transformDataMeta, CUSTOM_CONFIG);
    for (const target of ["rows", "record"]) {
      expect(outputByName(outputs, target)?.fields?.map((f) => f.name)).toEqual([
        "subject",
        "amount_due",
      ]);
    }
  });

  it("synthesizes nothing in destination-action mode (the recorded CS-6 asymmetry)", () => {
    const result = applyDynamicOutputs(transformDataMeta, {
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
      // A stale custom schema left in config must not leak through the gate.
      destinationSchema: CUSTOM_CONFIG.destinationSchema,
    });
    expect(result).toBe(transformDataMeta.outputs);
  });

  it("destinationMode defaults to `action` → uncommitted mode synthesizes nothing", () => {
    const result = applyDynamicOutputs(transformDataMeta, {
      destinationSchema: CUSTOM_CONFIG.destinationSchema,
    });
    expect(result).toBe(transformDataMeta.outputs);
  });
});

describe("applyDynamicOutputs — invalid committed values are rejected (no synthesis)", () => {
  const cases: Array<[string, unknown]> = [
    ["not an object", "gross_pay"],
    ["null", null],
    ["fields not an array", { fields: "employee_name" }],
    ["empty fields array", { fields: [] }],
    ["unknown top-level key", { fields: [{ name: "a", type: "string" }], extra: 1 }],
    ["illegal field name", { fields: [{ name: "1bad", type: "string" }] }],
    ["unknown field type", { fields: [{ name: "a", type: "object" }] }],
    [
      "case-insensitive duplicate names",
      { fields: [{ name: "Total", type: "string" }, { name: "total", type: "number" }] },
    ],
    [
      "over the 200-field cap",
      {
        fields: Array.from({ length: 201 }, (_, i) => ({
          name: `f_${i}`,
          type: "string",
        })),
      },
    ],
  ];

  it.each(cases)("%s → static outputs unchanged", (_label, value) => {
    const result = applyDynamicOutputs(analyzeDocumentMeta, {
      mode: "extract_fields",
      expectedFields: value,
    });
    expect(result).toBe(analyzeDocumentMeta.outputs);
  });
});

describe("applyDynamicOutputs — hand-built meta edges", () => {
  const baseMeta: ActionMeta = {
    key: "native:fake_dyn",
    provider: "native",
    type: "fake_dyn",
    displayName: "Fake Dynamic",
    description: "Test meta.",
    category: "other",
    requiresIntegration: false,
    fields: [
      { name: "schema", label: "Schema", type: "schema-fields", required: false },
      { name: "gate", label: "Gate", type: "text", required: false },
    ],
    outputs: [
      {
        name: "result",
        type: "object",
        fields: [{ name: "total", type: "number", description: "Static child." }],
      },
      { name: "other", type: "string" },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 10,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
    dynamicOutputs: [{ configField: "schema", attachUnder: "result" }],
  };

  const SCHEMA = {
    fields: [
      { name: "Total", type: "string" }, // collides with static `total` case-insensitively
      { name: "vendor", type: "string" },
    ],
  };

  it("without whenField the declaration is always active", () => {
    const outputs = applyDynamicOutputs(baseMeta, { schema: SCHEMA });
    expect(outputByName(outputs, "result")!.fields!.map((f) => f.name)).toEqual([
      "total",
      "vendor",
    ]);
  });

  it("static children win a case-insensitive name collision (duplicate outputs prevented)", () => {
    const outputs = applyDynamicOutputs(baseMeta, { schema: SCHEMA });
    const children = outputByName(outputs, "result")!.fields!;
    expect(children.filter((c) => c.name.toLowerCase() === "total")).toHaveLength(1);
    expect(children[0]!.description).toBe("Static child.");
  });

  it("whenField WITHOUT whenValueIn is a presence gate", () => {
    const meta: ActionMeta = {
      ...baseMeta,
      dynamicOutputs: [
        { configField: "schema", attachUnder: "result", whenField: "gate" },
      ],
    };
    expect(applyDynamicOutputs(meta, { schema: SCHEMA })).toBe(meta.outputs);
    expect(applyDynamicOutputs(meta, { schema: SCHEMA, gate: "" })).toBe(meta.outputs);
    const active = applyDynamicOutputs(meta, { schema: SCHEMA, gate: "on" });
    expect(outputByName(active, "result")!.fields!.some((f) => f.name === "vendor")).toBe(
      true,
    );
  });

  it("a declaration whose attachUnder names no declared output is ignored safely", () => {
    const meta: ActionMeta = {
      ...baseMeta,
      dynamicOutputs: [{ configField: "schema", attachUnder: "ghost" }],
    };
    expect(applyDynamicOutputs(meta, { schema: SCHEMA })).toEqual(meta.outputs);
  });

  it("all synthesized names colliding with static children → target keeps identity", () => {
    const meta = baseMeta;
    const outputs = applyDynamicOutputs(meta, {
      schema: { fields: [{ name: "total", type: "currency" }] },
    });
    expect(outputs).toBe(meta.outputs);
  });
});
