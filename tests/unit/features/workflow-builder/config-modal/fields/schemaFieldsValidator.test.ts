/** @jest-environment node */
import {
  SCHEMA_FIELDS_MAX_ROWS,
  normalizeSchemaFieldName,
  readSchemaFieldsValue,
  validateSchemaFieldsValue,
} from "@/features/workflow-builder/config-modal/fields/_schemaFieldsValidator";
import { collectSchemaFieldsBlockingError } from "@/features/workflow-builder/config-modal/fields/_schemaFieldsBlocking";
import { UserDefinedSchemaSchema } from "@/contracts/aiProcessing";
import type { FieldMeta } from "@/contracts/actionMeta";

const rows = (...names: string[]) => ({
  fields: names.map((name) => ({ name, type: "string" as const })),
});

describe("normalizeSchemaFieldName", () => {
  it.each([
    ["Employee Name", "employee_name"],
    ["  Gross Pay ($)  ", "gross_pay"],
    ["department-id", "department_id"],
    ["Driver's License", "drivers_license"],
    ["2024 Total", "f_2024_total"],
    ["already_ok", "already_ok"],
    ["MiXeD CaSe", "mixed_case"],
    ["a___b", "a_b"],
    ["   ", ""],
    ["!!!", ""],
  ])("normalizes %p → %p", (input, expected) => {
    expect(normalizeSchemaFieldName(input)).toBe(expected);
  });

  it("produces names the committed runtime contract accepts", () => {
    for (const raw of ["Employee Name", "Gross Pay ($)", "2024 Total"]) {
      const name = normalizeSchemaFieldName(raw);
      expect(
        UserDefinedSchemaSchema.safeParse({ fields: [{ name, type: "string" }] }).success,
      ).toBe(true);
    }
  });
});

describe("readSchemaFieldsValue", () => {
  it("reads a committed value and drops unreadable entries", () => {
    expect(
      readSchemaFieldsValue({
        fields: [
          { name: "a", type: "string", required: true, description: "A" },
          { name: "b", type: "number" },
          "garbage",
          null,
        ],
      }),
    ).toEqual([
      { name: "a", type: "string", required: true, description: "A" },
      { name: "b", type: "number" },
    ]);
  });

  it("tolerates foreign shapes without throwing", () => {
    for (const value of [undefined, null, "text", 42, [], { fields: "no" }]) {
      expect(readSchemaFieldsValue(value)).toEqual([]);
    }
  });
});

describe("validateSchemaFieldsValue", () => {
  it("accepts a valid schema", () => {
    expect(validateSchemaFieldsValue(rows("employee_name", "gross_pay"))).toEqual({
      error: null,
      rowErrors: {},
    });
  });

  it("empty is an error only when the field is required", () => {
    expect(validateSchemaFieldsValue(undefined, { required: true }).error).toBe(
      "Add at least one field.",
    );
    expect(validateSchemaFieldsValue({ fields: [] }, { required: true }).error).toBe(
      "Add at least one field.",
    );
    expect(validateSchemaFieldsValue(undefined).error).toBeNull();
    expect(validateSchemaFieldsValue({ fields: [] }).error).toBeNull();
  });

  it("flags duplicate names case-insensitively, on the SECOND row", () => {
    const result = validateSchemaFieldsValue(rows("amount", "Amount"));
    expect(result.error).toContain("Field 2");
    expect(result.rowErrors[1]).toContain("unique");
    expect(result.rowErrors[0]).toBeUndefined();
  });

  it("flags blank and invalid names with user-friendly copy", () => {
    expect(validateSchemaFieldsValue(rows("")).rowErrors[0]).toBe(
      "Give this field a name.",
    );
    expect(validateSchemaFieldsValue(rows("has space")).rowErrors[0]).toContain(
      "letters, numbers, and underscores",
    );
    expect(validateSchemaFieldsValue(rows("1leading")).rowErrors[0]).toContain(
      "starting with a letter",
    );
  });

  it("flags an unknown type", () => {
    const result = validateSchemaFieldsValue({
      fields: [{ name: "ok", type: "datetime" }],
    });
    expect(result.rowErrors[0]).toBe("Choose a type for this field.");
  });

  it("enforces the max row count", () => {
    const many = {
      fields: Array.from({ length: SCHEMA_FIELDS_MAX_ROWS + 1 }, (_, i) => ({
        name: `f_${i}`,
        type: "string" as const,
      })),
    };
    expect(validateSchemaFieldsValue(many).error).toBe(
      `Maximum ${SCHEMA_FIELDS_MAX_ROWS} fields.`,
    );
    const exactly = {
      fields: Array.from({ length: SCHEMA_FIELDS_MAX_ROWS }, (_, i) => ({
        name: `f_${i}`,
        type: "string" as const,
      })),
    };
    expect(validateSchemaFieldsValue(exactly).error).toBeNull();
  });

  it("summarizes when several rows are broken", () => {
    expect(validateSchemaFieldsValue(rows("", "bad name")).error).toBe(
      "2 fields need attention.",
    );
  });

  it("rejects an unreadable value shape", () => {
    expect(validateSchemaFieldsValue("nope").error).toContain("readable format");
    expect(validateSchemaFieldsValue({ fields: 5 }).error).toContain("readable format");
  });

  it("agrees with the committed runtime contract on valid input", () => {
    const value = rows("employee_name", "overtime_hours");
    expect(validateSchemaFieldsValue(value).error).toBeNull();
    expect(UserDefinedSchemaSchema.safeParse(value).success).toBe(true);
  });
});

describe("collectSchemaFieldsBlockingError (save gate)", () => {
  const field = (overrides: Partial<FieldMeta> = {}): FieldMeta =>
    ({
      name: "expectedFields",
      label: "Fields to extract",
      type: "schema-fields",
      required: true,
      ...overrides,
    }) as FieldMeta;

  it("blocks on an invalid visible schema, labeled by the field", () => {
    const error = collectSchemaFieldsBlockingError([field()], {
      expectedFields: rows("a", "a"),
    });
    expect(error).toContain("Fields to extract:");
    expect(error).toContain("unique");
  });

  it("passes when the schema is valid", () => {
    expect(
      collectSchemaFieldsBlockingError([field()], { expectedFields: rows("a", "b") }),
    ).toBeNull();
  });

  it("does NOT block on a hidden conditional schema (readiness parity)", () => {
    const hidden = field({
      visibleWhen: { field: "mode", valueIn: ["extract_fields"] },
    } as Partial<FieldMeta>);
    // mode is something else → the schema field is hidden → not a gap.
    expect(
      collectSchemaFieldsBlockingError([hidden], { mode: "summarize" }),
    ).toBeNull();
    // mode matches → now it must be satisfied.
    expect(
      collectSchemaFieldsBlockingError([hidden], { mode: "extract_fields" }),
    ).toContain("Add at least one field.");
  });

  it("ignores non-schema fields entirely", () => {
    const other = { name: "instructions", label: "Instructions", type: "textarea" } as FieldMeta;
    expect(collectSchemaFieldsBlockingError([other], { instructions: "" })).toBeNull();
  });
});
