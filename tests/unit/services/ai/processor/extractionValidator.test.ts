/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — the extraction validator.
 *
 * Proves the four owner-locked rules: every declared key always present,
 * undeclared keys stripped, required-missing fails under `strict`, and
 * coercion is narrow enough to refuse rather than guess.
 */
import { ROW_CONFIDENCE_KEY, type UserDefinedSchema } from "@/contracts/aiProcessing";
import {
  blankLowConfidenceRows,
  coerceSchemaValue,
  validateExtractedFields,
  validateExtractedRows,
} from "@/services/ai/processor/extractionValidator";

const SCHEMA: UserDefinedSchema = {
  fields: [
    { name: "employee_name", type: "string", required: true },
    { name: "gross_pay", type: "currency", required: true },
    { name: "pay_date", type: "date" },
    { name: "is_contractor", type: "boolean" },
    { name: "hours", type: "number" },
  ],
};

const OPTIONS = { schema: SCHEMA, strict: true, confidenceThreshold: 0.7 };

function cell(value: unknown, confidence = 0.9) {
  return { value, confidence };
}

describe("coerceSchemaValue", () => {
  it("normalizes currency and numbers", () => {
    expect(coerceSchemaValue("currency", "$1,234.56")).toEqual({ ok: true, value: 1234.56 });
    expect(coerceSchemaValue("currency", "(1,234.56)")).toEqual({ ok: true, value: -1234.56 });
    expect(coerceSchemaValue("currency", "USD 42")).toEqual({ ok: true, value: 42 });
    expect(coerceSchemaValue("number", 7.5)).toEqual({ ok: true, value: 7.5 });
    expect(coerceSchemaValue("number", "-3")).toEqual({ ok: true, value: -3 });
    expect(coerceSchemaValue("number", "n/a")).toEqual({ ok: false, expected: "a number" });
    expect(coerceSchemaValue("number", Number.NaN)).toEqual({ ok: false, expected: "a number" });
  });

  it("reads yes/no booleans and refuses anything ambiguous", () => {
    for (const yes of [true, 1, "Yes", "TRUE", " y ", "on"]) {
      expect(coerceSchemaValue("boolean", yes)).toEqual({ ok: true, value: true });
    }
    for (const no of [false, 0, "no", "FALSE", "n", "off"]) {
      expect(coerceSchemaValue("boolean", no)).toEqual({ ok: true, value: false });
    }
    expect(coerceSchemaValue("boolean", "maybe")).toEqual({
      ok: false,
      expected: "yes or no",
    });
    expect(coerceSchemaValue("boolean", 7)).toEqual({ ok: false, expected: "yes or no" });
  });

  it("normalizes the supported date formats to YYYY-MM-DD", () => {
    expect(coerceSchemaValue("date", "2026-07-04")).toEqual({ ok: true, value: "2026-07-04" });
    expect(coerceSchemaValue("date", "2026-7-4")).toEqual({ ok: true, value: "2026-07-04" });
    expect(coerceSchemaValue("date", "2026-07-04T10:00:00Z")).toEqual({
      ok: true,
      value: "2026-07-04",
    });
    expect(coerceSchemaValue("date", "7/4/2026")).toEqual({ ok: true, value: "2026-07-04" });
    expect(coerceSchemaValue("date", "July 4, 2026")).toEqual({ ok: true, value: "2026-07-04" });
    expect(coerceSchemaValue("date", "4 Jul 2026")).toEqual({ ok: true, value: "2026-07-04" });
    expect(coerceSchemaValue("date", "sometime in July")).toEqual({
      ok: false,
      expected: "a date",
    });
    expect(coerceSchemaValue("date", "2026-13-01")).toEqual({ ok: false, expected: "a date" });
  });

  it("treats null, undefined, and empty strings as 'not found'", () => {
    for (const type of ["string", "number", "currency", "boolean", "date"] as const) {
      expect(coerceSchemaValue(type, null)).toEqual({ ok: true, value: null });
      expect(coerceSchemaValue(type, undefined)).toEqual({ ok: true, value: null });
      expect(coerceSchemaValue(type, "  ")).toEqual({ ok: true, value: null });
    }
  });

  it("stringifies scalars into a text field but refuses objects", () => {
    expect(coerceSchemaValue("string", 42)).toEqual({ ok: true, value: "42" });
    expect(coerceSchemaValue("string", { a: 1 })).toEqual({ ok: false, expected: "text" });
  });
});

describe("validateExtractedFields", () => {
  it("returns every declared key, coerced, and strips undeclared ones", () => {
    const result = validateExtractedFields(
      {
        fields: {
          employee_name: cell(" Ada Lovelace "),
          gross_pay: cell("$4,200.00"),
          pay_date: cell("7/31/2026"),
          is_contractor: cell("no"),
          hours: cell(null),
          hallucinated_ssn: cell("000-00-0000"),
        },
        overallConfidence: 0.91,
      },
      OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.values).toEqual({
      employee_name: "Ada Lovelace",
      gross_pay: 4200,
      pay_date: "2026-07-31",
      is_contractor: false,
      hours: null,
    });
    expect(Object.keys(result.value.values)).not.toContain("hallucinated_ssn");
    expect(result.value.overallConfidence).toBe(0.91);
  });

  it("fails on a missing required value when strict, and nulls it when not", () => {
    const payload = {
      fields: {
        employee_name: cell(null),
        gross_pay: cell(1),
        pay_date: cell(null),
        is_contractor: cell(null),
        hours: cell(null),
      },
      overallConfidence: 0.5,
    };
    const strict = validateExtractedFields(payload, OPTIONS);
    expect(strict.ok).toBe(false);
    if (strict.ok) return;
    expect(strict.issues).toEqual(["employee_name: required value not found"]);

    const lenient = validateExtractedFields(payload, { ...OPTIONS, strict: false });
    expect(lenient.ok).toBe(true);
    if (!lenient.ok) return;
    expect(lenient.value.values.employee_name).toBeNull();
  });

  it("reports a type failure by field name only, never the value", () => {
    const result = validateExtractedFields(
      {
        fields: {
          employee_name: cell("Ada"),
          gross_pay: cell("about four thousand"),
          pay_date: cell(null),
          is_contractor: cell(null),
          hours: cell(null),
        },
        overallConfidence: 0.5,
      },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(["gross_pay: expected a number"]);
    expect(result.issues.join()).not.toContain("about four thousand");
  });

  it("lists low-confidence fields without failing", () => {
    const result = validateExtractedFields(
      {
        fields: {
          employee_name: cell("Ada", 0.4),
          gross_pay: cell(1, 0.95),
          pay_date: cell(null, 0.2),
          is_contractor: cell(null, 0.9),
          hours: cell(null, 0.9),
        },
        overallConfidence: 0.6,
      },
      { ...OPTIONS, strict: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lowConfidence).toEqual(["employee_name", "pay_date"]);
  });

  it("treats an absent field entry as not-found rather than crashing", () => {
    const result = validateExtractedFields(
      { fields: {}, overallConfidence: 0.9 },
      { ...OPTIONS, strict: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.values)).toEqual([
      "employee_name",
      "gross_pay",
      "pay_date",
      "is_contractor",
      "hours",
    ]);
    expect(result.value.lowConfidence).toHaveLength(5);
  });
});

describe("validateExtractedRows", () => {
  const rowOptions = { ...OPTIONS, maxRows: 100 };

  it("coerces each row, keeps the reserved confidence key, and strips extras", () => {
    const result = validateExtractedRows(
      {
        rows: [
          {
            employee_name: "Ada",
            gross_pay: "$1,000",
            pay_date: "2026-01-02",
            is_contractor: "yes",
            hours: "40",
            extra_column: "dropped",
            [ROW_CONFIDENCE_KEY]: 0.8,
          },
        ],
        overallConfidence: 0.8,
      },
      rowOptions,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]).toEqual({
      employee_name: "Ada",
      gross_pay: 1000,
      pay_date: "2026-01-02",
      is_contractor: true,
      hours: 40,
      [ROW_CONFIDENCE_KEY]: 0.8,
    });
  });

  it("labels low-confidence rows positionally and refuses over-long results", () => {
    const rows = [
      { employee_name: "A", gross_pay: 1, [ROW_CONFIDENCE_KEY]: 0.9 },
      { employee_name: "B", gross_pay: 2, [ROW_CONFIDENCE_KEY]: 0.1 },
    ];
    const ok = validateExtractedRows({ rows, overallConfidence: 0.5 }, rowOptions);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.lowConfidence).toEqual(["rows[1]"]);

    const capped = validateExtractedRows(
      { rows, overallConfidence: 0.5 },
      { ...rowOptions, maxRows: 1 },
    );
    expect(capped.ok).toBe(false);
  });

  it("names the failing row and column when a required value is missing", () => {
    const result = validateExtractedRows(
      {
        rows: [{ employee_name: "A", gross_pay: null, [ROW_CONFIDENCE_KEY]: 0.9 }],
        overallConfidence: 0.9,
      },
      rowOptions,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(["rows[0].gross_pay: required value not found"]);
  });
});

describe("blankLowConfidenceRows", () => {
  it("blanks declared columns of low-confidence rows and leaves the rest alone", () => {
    const rows = [
      { employee_name: "A", gross_pay: 1, [ROW_CONFIDENCE_KEY]: 0.95 },
      { employee_name: "B", gross_pay: 2, [ROW_CONFIDENCE_KEY]: 0.1 },
    ];
    const blanked = blankLowConfidenceRows(rows, SCHEMA, 0.7);
    expect(blanked[0]).toEqual(rows[0]);
    expect(blanked[1]).toEqual({
      employee_name: null,
      gross_pay: null,
      pay_date: null,
      is_contractor: null,
      hours: null,
      [ROW_CONFIDENCE_KEY]: 0.1,
    });
  });
});
