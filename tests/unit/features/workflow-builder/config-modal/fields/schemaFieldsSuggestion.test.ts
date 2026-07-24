/** @jest-environment node */
/**
 * AI-PROVIDER-7 (CS-7) — merging a Suggest-fields proposal.
 *
 * The rule this file protects: ADD can never destroy the author's work, a
 * proposal is held to the same name rules as anything typed by hand, and
 * REPLACE only ever happens because the caller asked for replace.
 */
import {
  describeMerge,
  mergeSuggestedFields,
  replaceWithSuggestedFields,
} from "@/features/workflow-builder/config-modal/fields/_schemaFieldsSuggestion";
import {
  SCHEMA_FIELDS_MAX_ROWS,
  type SchemaFieldRow,
} from "@/features/workflow-builder/config-modal/fields/_schemaFieldsValidator";
import type { SuggestedSchemaField } from "@/lib/api/schemaSuggestion";

const existing: SchemaFieldRow[] = [
  { name: "employee_name", type: "string", required: true },
  { name: "gross_pay", type: "currency", description: "Mine." },
];

const suggested: SuggestedSchemaField[] = [
  { name: "employee_name", type: "string" },
  { name: "pay_date", type: "date", required: true, description: "Period end." },
  { name: "hours", type: "number" },
];

describe("mergeSuggestedFields", () => {
  it("keeps existing rows untouched and appends only new names", () => {
    const result = mergeSuggestedFields(existing, suggested);
    expect(result.rows.slice(0, 2)).toEqual(existing);
    expect(result.rows.map((r) => r.name)).toEqual([
      "employee_name",
      "gross_pay",
      "pay_date",
      "hours",
    ]);
    expect(result.added).toBe(2);
    expect(result.skippedDuplicates).toBe(1);
  });

  it("compares names case-insensitively, like the validator does", () => {
    const result = mergeSuggestedFields(existing, [{ name: "Employee_Name", type: "string" }]);
    expect(result.added).toBe(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(result.rows).toEqual(existing);
  });

  it("normalizes proposed names with the SAME rules as hand-typed ones", () => {
    const result = mergeSuggestedFields(
      [],
      [
        { name: "Employee Name", type: "string" },
        { name: "Gross Pay ($)", type: "currency" },
        { name: "2024 Total", type: "number" },
      ],
    );
    expect(result.rows.map((r) => r.name)).toEqual([
      "employee_name",
      "gross_pay",
      "f_2024_total",
    ]);
  });

  it("drops proposed rows that cannot become a legal name", () => {
    const result = mergeSuggestedFields([], [
      { name: "   ", type: "string" },
      { name: "!!!", type: "string" },
      { name: "ok_field", type: "string" },
    ]);
    expect(result.rows.map((r) => r.name)).toEqual(["ok_field"]);
  });

  it("de-duplicates within the proposal itself", () => {
    const result = mergeSuggestedFields([], [
      { name: "Total", type: "currency" },
      { name: "total", type: "string" },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ name: "total", type: "currency" });
  });

  it("carries required + description through, and omits empty descriptions", () => {
    const result = mergeSuggestedFields([], [
      { name: "a", type: "string", required: true, description: " Trim me " },
      { name: "b", type: "string", description: "   " },
    ]);
    expect(result.rows[0]).toEqual({ name: "a", type: "string", required: true, description: "Trim me" });
    expect(result.rows[1]).toEqual({ name: "b", type: "string" });
  });

  it("respects the row cap and reports what didn't fit", () => {
    const full: SchemaFieldRow[] = Array.from(
      { length: SCHEMA_FIELDS_MAX_ROWS },
      (_, i) => ({ name: `field_${i}`, type: "string" }),
    );
    const result = mergeSuggestedFields(full, [{ name: "one_more", type: "string" }]);
    expect(result.rows).toHaveLength(SCHEMA_FIELDS_MAX_ROWS);
    expect(result.added).toBe(0);
    expect(result.skippedOverCap).toBe(1);
  });

  it("is a no-op for an empty proposal", () => {
    const result = mergeSuggestedFields(existing, []);
    expect(result.rows).toEqual(existing);
    expect(result.added).toBe(0);
  });
});

describe("replaceWithSuggestedFields", () => {
  it("swaps the rows for the normalized proposal", () => {
    const result = replaceWithSuggestedFields(suggested);
    expect(result.rows.map((r) => r.name)).toEqual([
      "employee_name",
      "pay_date",
      "hours",
    ]);
    expect(result.added).toBe(3);
  });

  it("truncates at the row cap", () => {
    const many: SuggestedSchemaField[] = Array.from(
      { length: SCHEMA_FIELDS_MAX_ROWS + 3 },
      (_, i) => ({ name: `field_${i}`, type: "string" as const }),
    );
    const result = replaceWithSuggestedFields(many);
    expect(result.rows).toHaveLength(SCHEMA_FIELDS_MAX_ROWS);
    expect(result.skippedOverCap).toBe(3);
  });
});

describe("describeMerge", () => {
  it("says what happened, in plain language", () => {
    expect(describeMerge(mergeSuggestedFields(existing, suggested))).toBe(
      "Added 2 fields. 1 you already had was left alone.",
    );
    expect(describeMerge(mergeSuggestedFields([], [{ name: "only", type: "string" }]))).toBe(
      "Added 1 field.",
    );
  });
});
