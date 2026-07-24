/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — destination derivation.
 *
 * This is the helper that makes "transform into another action" possible
 * without the author retyping a schema ChainReact already knows. Two things
 * must hold: the derived schema is a legal `UserDefinedSchema` for EVERY
 * registered action, and it never carries anything but product metadata.
 */
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import { UserDefinedSchemaSchema } from "@/contracts/aiProcessing";
import {
  deriveDestinationContext,
  destinationFieldType,
  hasMappableDestinationFields,
} from "@/core/workflows/deriveDestinationContext";
import { getActionMeta, listAllActionMetas } from "@/services/discovery/_registry";

function meta(fields: readonly Partial<FieldMeta>[]): ActionMeta {
  return {
    key: "demo:create_thing",
    provider: "demo",
    type: "create_thing",
    displayName: "Create Thing",
    description: "Creates a thing.",
    category: "other",
    requiresIntegration: true,
    fields: fields.map((f) => ({
      name: "field",
      label: "Field",
      type: "text",
      required: false,
      ...f,
    })) as FieldMeta[],
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: null,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  } as ActionMeta;
}

describe("field-type mapping", () => {
  it("maps scalar renderers onto user-schema types", () => {
    const cases: [FieldMeta["type"], string | null][] = [
      ["text", "string"],
      ["textarea", "string"],
      ["select", "string"],
      ["combobox", "string"],
      ["timezone", "string"],
      ["date", "date"],
      ["number", "number"],
      ["boolean", "boolean"],
    ];
    for (const [type, expected] of cases) {
      expect(
        destinationFieldType({ name: "f", label: "F", type, required: false } as FieldMeta),
      ).toBe(expected);
    }
  });

  it("keeps datetime/time as text so a time component is never destroyed", () => {
    for (const type of ["datetime", "datetime-utc", "time"] as const) {
      expect(
        destinationFieldType({ name: "f", label: "F", type, required: false } as FieldMeta),
      ).toBe("string");
    }
  });

  it("has no scalar equivalent for structured shapes", () => {
    for (const type of [
      "file",
      "file-array",
      "string-array",
      "keyvalue",
      "keyvalue-list",
      "object",
      "object-list",
      "json",
      "schema-fields",
      "router-routes",
      "spreadsheet-rows",
    ] as const) {
      expect(
        destinationFieldType({ name: "f", label: "F", type, required: false } as FieldMeta),
      ).toBeNull();
    }
  });
});

describe("exclusions", () => {
  it.each([
    ["sensitive", { name: "apiKey", label: "API key", sensitivity: "secret" as const }],
    ["sensitive", { name: "acct", label: "Account", sensitivity: "connection" as const }],
    ["composite", { name: "rowsBatch", label: "Rows", renderedBy: "values" }],
    ["advanced", { name: "tuning", label: "Tuning", advanced: true }],
    ["provider_resource", { name: "baseId", label: "Base", optionsSource: "airtable:bases" }],
    [
      "multi_value",
      {
        name: "tags",
        label: "Tags",
        type: "select" as const,
        multiple: true,
        options: [{ value: "a", label: "A" }],
      },
    ],
    ["unsupported_type", { name: "payload", label: "Payload", type: "json" as const, advanced: false }],
    ["unsupported_name", { name: "9lives", label: "Nine" }],
  ])("excludes %s fields and reports the reason", (reason, field) => {
    const derived = deriveDestinationContext(meta([field as Partial<FieldMeta>]));
    expect(derived.schema).toBeNull();
    expect(derived.context.excludedFields).toEqual([
      { name: (field as FieldMeta).name, label: (field as FieldMeta).label, reason },
    ]);
  });

  it("drops a case-insensitive duplicate name the meta contract allows", () => {
    const derived = deriveDestinationContext(
      meta([
        { name: "Name", label: "Name" },
        { name: "name", label: "Name (lower)" },
      ]),
    );
    expect(derived.schema?.fields.map((f) => f.name)).toEqual(["Name"]);
    expect(derived.context.excludedFields).toEqual([
      { name: "name", label: "Name (lower)", reason: "unsupported_name" },
    ]);
  });
});

describe("context richness", () => {
  it("carries labels, help text, static options, defaults, and bounds", () => {
    const derived = deriveDestinationContext(
      meta([
        {
          name: "importance",
          label: "Importance",
          type: "select",
          required: true,
          description: "How urgent the message is.",
          defaultValue: "normal",
          options: [
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ],
        },
        {
          name: "retries",
          label: "Retries",
          type: "number",
          required: false,
          numeric: { min: 0, max: 5, integer: true },
        },
      ]),
    );
    expect(derived.context.fields[0]).toEqual({
      name: "importance",
      label: "Importance",
      type: "string",
      required: true,
      description: "How urgent the message is.",
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ],
      defaultValue: "normal",
    });
    expect(derived.context.fields[1]?.numeric).toEqual({ min: 0, max: 5, integer: true });
    expect(derived.context.action).toEqual({
      key: "demo:create_thing",
      displayName: "Create Thing",
      description: "Creates a thing.",
    });
  });

  it("derives a mode-gated field as OPTIONAL and passes the condition as context", () => {
    const derived = deriveDestinationContext(
      meta([
        { name: "mode", label: "Mode", type: "select", required: true, options: [{ value: "a", label: "A" }] },
        {
          name: "detail",
          label: "Detail",
          required: true,
          visibleWhen: { field: "mode", valueIn: ["a"] },
        },
      ]),
    );
    const detail = derived.context.fields.find((f) => f.name === "detail");
    expect(detail?.required).toBe(false);
    expect(detail?.onlyWhen).toEqual({ field: "mode", valueIn: ["a"] });
    expect(derived.schema?.fields.find((f) => f.name === "detail")?.required).toBeUndefined();
  });

  it("preserves the destination's own field order", () => {
    const derived = deriveDestinationContext(
      meta([
        { name: "zulu", label: "Zulu" },
        { name: "alpha", label: "Alpha" },
      ]),
    );
    expect(derived.schema?.fields.map((f) => f.name)).toEqual(["zulu", "alpha"]);
  });
});

describe("against the real registry", () => {
  it("produces a CONTRACT-VALID schema for every registered action", () => {
    const offenders: string[] = [];
    for (const actionMeta of listAllActionMetas()) {
      const derived = deriveDestinationContext(actionMeta);
      if (derived.schema === null) continue;
      const parsed = UserDefinedSchemaSchema.safeParse(derived.schema);
      if (!parsed.success) offenders.push(actionMeta.key);
    }
    expect(offenders).toEqual([]);
  });

  it("agrees with hasMappableDestinationFields everywhere", () => {
    for (const actionMeta of listAllActionMetas()) {
      const derived = deriveDestinationContext(actionMeta);
      expect(hasMappableDestinationFields(actionMeta)).toBe(derived.schema !== null);
    }
  });

  it("derives a real email action into its scalar body fields", () => {
    const outlook = getActionMeta("microsoft-outlook:send_email");
    expect(outlook).toBeDefined();
    const derived = deriveDestinationContext(outlook!);
    expect(derived.schema?.fields.map((f) => f.name)).toEqual([
      "subject",
      "body",
      "isHtml",
      "importance",
    ]);
    // Recipients are `string-array` — a real, documented phase-1 gap, reported
    // rather than silently dropped.
    expect(derived.context.excludedFields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["to", "cc", "bcc"]),
    );
  });

  it("never emits anything but product metadata (no user/account/credential data)", () => {
    // Structural no-leak: the ONLY keys a context field may carry are the
    // declared metadata keys. A future meta field that smuggled runtime state
    // in would fail here rather than reaching a model request.
    const allowed = new Set([
      "name",
      "label",
      "type",
      "required",
      "description",
      "options",
      "defaultValue",
      "numeric",
      "onlyWhen",
    ]);
    for (const actionMeta of listAllActionMetas()) {
      const derived = deriveDestinationContext(actionMeta);
      for (const field of derived.context.fields) {
        for (const key of Object.keys(field)) {
          expect(allowed.has(key)).toBe(true);
        }
      }
      expect(Object.keys(derived.context).sort()).toEqual([
        "action",
        "excludedFields",
        "fields",
      ]);
    }
  });

  it("never carries a secret- or connection-classified field into the context", () => {
    for (const actionMeta of listAllActionMetas()) {
      const derived = deriveDestinationContext(actionMeta);
      const included = new Set(derived.context.fields.map((f) => f.name));
      for (const field of actionMeta.fields) {
        if (field.sensitivity === "secret" || field.sensitivity === "connection") {
          expect(included.has(field.name)).toBe(false);
        }
      }
    }
  });
});
