/** @jest-environment node */
import {
  AiProcessLimitsSchema,
  AiProcessorTaskSchema,
  AnswerQuestionsResultSchema,
  ClassifyResultSchema,
  DocumentAnalysisModeSchema,
  DocumentTextPayloadSchema,
  ExtractFieldsResultSchema,
  ExtractRowsResultSchema,
  SummarizeResultSchema,
  USER_SCHEMA_MAX_FIELDS,
  UserDefinedSchemaSchema,
} from "@/contracts/aiProcessing";

describe("contracts/aiProcessing", () => {
  it("pins the task and mode vocabularies", () => {
    expect(AiProcessorTaskSchema.options).toEqual([
      "analyze_document",
      "transform_data",
      "suggest_schema",
    ]);
    expect(DocumentAnalysisModeSchema.options).toEqual([
      "summarize",
      "extract_fields",
      "extract_rows",
      "classify",
      "answer_questions",
    ]);
  });

  describe("UserDefinedSchema", () => {
    const field = (name: string, type = "string" as const) => ({ name, type });

    it("accepts a well-formed schema", () => {
      const parsed = UserDefinedSchemaSchema.parse({
        fields: [
          { name: "employee_name", type: "string", required: true },
          { name: "grossPay", type: "currency", description: "Total pay" },
          { name: "hire_date", type: "date" },
        ],
      });
      expect(parsed.fields).toHaveLength(3);
    });

    it.each([
      ["1starts_with_digit"],
      ["_leading_underscore"],
      ["has space"],
      ["has-dash"],
      ["has.dot"],
      ["a".repeat(65)],
      [""],
    ])("rejects invalid field name %p", (name) => {
      expect(
        UserDefinedSchemaSchema.safeParse({ fields: [field(name)] }).success,
      ).toBe(false);
    });

    it("rejects duplicate names case-insensitively", () => {
      const result = UserDefinedSchemaSchema.safeParse({
        fields: [field("Amount"), field("amount")],
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty and over-cap field lists", () => {
      expect(UserDefinedSchemaSchema.safeParse({ fields: [] }).success).toBe(
        false,
      );
      const over = Array.from({ length: USER_SCHEMA_MAX_FIELDS + 1 }, (_, i) =>
        field(`f_${i}`),
      );
      expect(
        UserDefinedSchemaSchema.safeParse({ fields: over }).success,
      ).toBe(false);
      const exactly = Array.from({ length: USER_SCHEMA_MAX_FIELDS }, (_, i) =>
        field(`f_${i}`),
      );
      expect(
        UserDefinedSchemaSchema.safeParse({ fields: exactly }).success,
      ).toBe(true);
    });

    it("is strict — unknown keys rejected at both levels", () => {
      expect(
        UserDefinedSchemaSchema.safeParse({
          fields: [field("ok")],
          extra: true,
        }).success,
      ).toBe(false);
      expect(
        UserDefinedSchemaSchema.safeParse({
          fields: [{ name: "ok", type: "string", default: "x" }],
        }).success,
      ).toBe(false);
    });
  });

  describe("DocumentTextPayload", () => {
    it("accepts segments and rejects unknown keys / empty segments", () => {
      const good = {
        name: "payroll.pdf",
        mimeType: "application/pdf",
        truncated: false,
        segments: [{ label: "Page 1", text: "hello" }],
      };
      expect(DocumentTextPayloadSchema.parse(good)).toEqual(good);
      expect(
        DocumentTextPayloadSchema.safeParse({ ...good, segments: [] }).success,
      ).toBe(false);
      expect(
        DocumentTextPayloadSchema.safeParse({ ...good, bytes: "x" }).success,
      ).toBe(false);
    });
  });

  describe("result envelopes", () => {
    it("validates structure and clamps confidence to [0,1]", () => {
      expect(
        SummarizeResultSchema.safeParse({
          summary: "s",
          keyPoints: ["a"],
          overallConfidence: 0.9,
        }).success,
      ).toBe(true);
      expect(
        SummarizeResultSchema.safeParse({
          summary: "s",
          keyPoints: [],
          overallConfidence: 1.2,
        }).success,
      ).toBe(false);
      expect(
        ExtractFieldsResultSchema.safeParse({
          fields: { total: { value: "12.50", confidence: 0.8 } },
          overallConfidence: 0.8,
        }).success,
      ).toBe(true);
      expect(
        ExtractRowsResultSchema.safeParse({
          rows: [{ name: "a", _confidence: 0.7 }],
          overallConfidence: 0.7,
        }).success,
      ).toBe(true);
      expect(
        ClassifyResultSchema.safeParse({ label: "invoice", confidence: 0.6 })
          .success,
      ).toBe(true);
      expect(
        AnswerQuestionsResultSchema.safeParse({ answer: "", confidence: 0.5 })
          .success,
      ).toBe(false);
    });

    it("limits schema bounds maxRows to 1..500", () => {
      expect(
        AiProcessLimitsSchema.safeParse({ maxRows: 500, maxOutputTokens: 100 })
          .success,
      ).toBe(true);
      expect(
        AiProcessLimitsSchema.safeParse({ maxRows: 501, maxOutputTokens: 100 })
          .success,
      ).toBe(false);
      expect(
        AiProcessLimitsSchema.safeParse({ maxRows: 0, maxOutputTokens: 100 })
          .success,
      ).toBe(false);
    });
  });
});
