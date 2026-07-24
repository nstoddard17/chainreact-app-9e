import { z } from "zod";

/**
 * Cross-layer contracts for the ChainReact AI provider's processing layer.
 *
 * Per docs/slices/phase-5/ai-provider-platform-plan.md (AI-PROVIDER-PLAN-1):
 *   - These shapes cross boundaries: builder config <-> runtime handlers
 *     (CS-5/6), ChainReact <-> the AI processor client and its gateway wire
 *     contract (CS-2). They are deliberately input-kind-agnostic — documents
 *     are the first input kind, not the identity.
 *   - The full gateway request/response envelope is frozen by CS-2 in
 *     `services/ai/processor/`. This file holds only the contract-level
 *     building blocks later slices compose: task/mode enums, the
 *     user-defined schema, the document text payload, shared limits, and
 *     the per-mode model-result envelopes.
 *   - Model output is NEVER trusted: the envelopes here validate structure
 *     only (`value` stays `unknown`); per-field type validation/coercion
 *     against the user's schema is the CS-2 extraction validator's job.
 */

/** Operations the AI processor can perform. New tasks are additive. */
export const AiProcessorTaskSchema = z.enum([
  "analyze_document",
  "transform_data",
  "suggest_schema",
]);
export type AiProcessorTask = z.infer<typeof AiProcessorTaskSchema>;

/** Analysis modes inside the `analyze_document` task. */
export const DocumentAnalysisModeSchema = z.enum([
  "summarize",
  "extract_fields",
  "extract_rows",
  "classify",
  "answer_questions",
]);
export type DocumentAnalysisMode = z.infer<typeof DocumentAnalysisModeSchema>;

/** Cap on free-text instructions crossing to the model. */
export const INSTRUCTIONS_MAX_CHARS = 4000;

/**
 * User-defined schema: the author's declaration of the fields to extract
 * (analyze) or produce (transform). Names double as output keys and
 * template path segments (`{{node.fields.<name>}}`), so they are
 * restricted to identifier-safe characters.
 */
export const USER_SCHEMA_FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/** Sanity bound only — the effective limit is the input token/size budget. */
export const USER_SCHEMA_MAX_FIELDS = 200;

export const UserSchemaFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "currency",
]);
export type UserSchemaFieldType = z.infer<typeof UserSchemaFieldTypeSchema>;

export const UserSchemaFieldSpecSchema = z
  .object({
    name: z
      .string()
      .regex(
        USER_SCHEMA_FIELD_NAME_PATTERN,
        "Field names start with a letter and use only letters, digits, and underscores (max 64 chars).",
      ),
    type: UserSchemaFieldTypeSchema,
    required: z.boolean().optional(),
    /** Fed to the model as extraction guidance. Never required. */
    description: z.string().max(300).optional(),
  })
  .strict();
export type UserSchemaFieldSpec = z.infer<typeof UserSchemaFieldSpecSchema>;

export const UserDefinedSchemaSchema = z
  .object({
    fields: z
      .array(UserSchemaFieldSpecSchema)
      .min(1)
      .max(USER_SCHEMA_MAX_FIELDS)
      .superRefine((fields, ctx) => {
        const seen = new Set<string>();
        for (const field of fields) {
          const key = field.name.toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate field name "${field.name}" (names are case-insensitively unique).`,
            });
          }
          seen.add(key);
        }
      }),
  })
  .strict();
export type UserDefinedSchema = z.infer<typeof UserDefinedSchemaSchema>;

/**
 * Wire shape of parsed document text. Produced from the parsing layer's
 * `ParsedDocument` (core/documents) — segments preserve provenance
 * ("Page 3", "Sheet: Payroll") so the model can cite locations and so
 * page-range/truncation stay explainable. Never carries raw bytes.
 */
export const DocumentTextSegmentSchema = z
  .object({
    /** Human-readable provenance ("Page 3", "Sheet: Payroll", "" when N/A). */
    label: z.string(),
    text: z.string(),
  })
  .strict();
export type DocumentTextSegment = z.infer<typeof DocumentTextSegmentSchema>;

export const DocumentTextPayloadSchema = z
  .object({
    /** File name only — never a storage path or URL. */
    name: z.string().min(1),
    mimeType: z.string().min(1),
    /** True when the text budget dropped content before the model call. */
    truncated: z.boolean(),
    segments: z.array(DocumentTextSegmentSchema).min(1),
  })
  .strict();
export type DocumentTextPayload = z.infer<typeof DocumentTextPayloadSchema>;

/** Shared per-call limits, embedded in processor requests. */
export const AiProcessLimitsSchema = z
  .object({
    maxRows: z.number().int().min(1).max(500),
    maxOutputTokens: z.number().int().min(1),
  })
  .strict();
export type AiProcessLimits = z.infer<typeof AiProcessLimitsSchema>;

/** Confidence values are clamped to [0, 1] by producers; enforced here. */
export const ConfidenceSchema = z.number().min(0).max(1);

/**
 * Per-mode model-result envelopes. These validate the STRUCTURE of what
 * the model returns (via the gateway `result` object or the first-party
 * forced-tool-use payload). Field values stay `unknown` on purpose — the
 * CS-2 extraction validator coerces/validates them against the user's
 * declared schema and strips undeclared keys.
 */
export const SummarizeResultSchema = z
  .object({
    summary: z.string().min(1),
    keyPoints: z.array(z.string().min(1)).max(20),
    overallConfidence: ConfidenceSchema,
  })
  .strict();
export type SummarizeResult = z.infer<typeof SummarizeResultSchema>;

export const ExtractedFieldValueSchema = z
  .object({
    value: z.unknown(),
    confidence: ConfidenceSchema,
  })
  .strict();
export type ExtractedFieldValue = z.infer<typeof ExtractedFieldValueSchema>;

export const ExtractFieldsResultSchema = z
  .object({
    fields: z.record(z.string(), ExtractedFieldValueSchema),
    overallConfidence: ConfidenceSchema,
  })
  .strict();
export type ExtractFieldsResult = z.infer<typeof ExtractFieldsResultSchema>;

/**
 * Rows carry their per-row confidence under the reserved `_confidence`
 * key (the user-schema name pattern cannot produce a leading underscore,
 * so it can never collide with a declared column).
 */
export const ROW_CONFIDENCE_KEY = "_confidence";

export const ExtractRowsResultSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())),
    overallConfidence: ConfidenceSchema,
  })
  .strict();
export type ExtractRowsResult = z.infer<typeof ExtractRowsResultSchema>;

export const ClassifyResultSchema = z
  .object({
    label: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .strict();
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

export const AnswerQuestionsResultSchema = z
  .object({
    answer: z.string().min(1),
    confidence: ConfidenceSchema,
  })
  .strict();
export type AnswerQuestionsResult = z.infer<typeof AnswerQuestionsResultSchema>;

/** `suggest_schema` proposes a user-editable schema — same contract shape. */
export const SuggestSchemaResultSchema = UserDefinedSchemaSchema;
export type SuggestSchemaResult = z.infer<typeof SuggestSchemaResultSchema>;
