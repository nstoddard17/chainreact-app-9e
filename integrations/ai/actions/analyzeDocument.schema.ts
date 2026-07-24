import { z } from "zod";

import {
  DocumentAnalysisModeSchema,
  INSTRUCTIONS_MAX_CHARS,
  UserDefinedSchemaSchema,
} from "@/contracts/aiProcessing";

/**
 * Resolved-config contract for `ai:analyze_document` (AI-PROVIDER-5 CS-5).
 *
 * The engine pre-resolves every `{{...}}` template before dispatch, so this
 * parses REAL values. `.strict()` — an undeclared key is a config bug, not
 * something to forward to a paid model call.
 *
 * `file` is deliberately `unknown`: a single-token template returns the raw
 * upstream value, which may legitimately be a `FileRef`, plain text, or an
 * already-parsed document (see `core/documents/documentInput.ts`). Typing it
 * as `FileRefSchema` here would reject the text path with a Zod error whose
 * message means nothing to a workflow author; `classifyDocumentInput`
 * refuses unsupported shapes with copy that names what to do instead.
 *
 * Mode-specific requirements live in the superRefine at the bottom — the
 * runtime twin of the builder's `visibleWhen` + required-when-visible rules,
 * so a config assembled outside the builder (AI planner, template, API) is
 * held to exactly the same contract.
 */

/** Builder-facing quality labels. Mapped to the internal ModelTier in the handler. */
export const AnalyzeDocumentModelQualitySchema = z.enum(["standard", "advanced"]);
export type AnalyzeDocumentModelQuality = z.infer<
  typeof AnalyzeDocumentModelQualitySchema
>;

/**
 * What to do when the model's confidence falls below the threshold.
 * `flag` is the default: low confidence is INFORMATION, not an error
 * (owner-locked in the plan) — the step still succeeds and reports which
 * values were shaky.
 */
export const OnLowConfidenceSchema = z.enum(["flag", "fail", "blank"]);
export type OnLowConfidence = z.infer<typeof OnLowConfidenceSchema>;

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_MAX_ROWS = 100;
export const MAX_ROWS_CAP = 500;
export const MAX_PAGES_CAP = 500;
export const QUESTION_MAX_CHARS = 2000;
export const MAX_CLASSIFY_LABELS = 50;

export const AnalyzeDocumentConfigSchema = z
  .object({
    /** FileRef · text · ParsedDocument. Shape-checked at resolve time. */
    file: z.unknown(),

    mode: DocumentAnalysisModeSchema,

    /** Optional author guidance passed through to the model verbatim. */
    instructions: z.string().max(INSTRUCTIONS_MAX_CHARS).optional(),

    // ── Mode-scoped setup ───────────────────────────────────────────────
    /** extract_fields — the fields to pull out of the document. */
    expectedFields: UserDefinedSchemaSchema.optional(),
    /** extract_rows — the columns of each extracted row. */
    rowSchema: UserDefinedSchemaSchema.optional(),
    /** classify — the candidate labels. */
    labels: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(MAX_CLASSIFY_LABELS)
      .optional(),
    /** classify — allow "Other" when none of the labels fit. */
    allowOtherLabel: z.boolean().default(true),
    /** answer_questions — the question to answer about the document. */
    question: z.string().trim().min(1).max(QUESTION_MAX_CHARS).optional(),

    // ── Advanced ────────────────────────────────────────────────────────
    /** "1-5,8" — PDF pages only; warned + ignored for other formats. */
    pageRange: z.string().max(256).optional(),
    /** XLSX only; warned + ignored for other formats. */
    sheetName: z.string().max(256).optional(),
    /** Hard cap on pages/sheets analyzed, applied after the page range. */
    maxPages: z.number().int().min(1).max(MAX_PAGES_CAP).optional(),
    confidenceThreshold: z
      .number()
      .min(0)
      .max(1)
      .default(DEFAULT_CONFIDENCE_THRESHOLD),
    onLowConfidence: OnLowConfidenceSchema.default("flag"),
    /** Required-but-missing extraction values fail the step. */
    strictValidation: z.boolean().default(true),
    maxRows: z.number().int().min(1).max(MAX_ROWS_CAP).default(DEFAULT_MAX_ROWS),
    modelQuality: AnalyzeDocumentModelQualitySchema.default("standard"),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.mode === "extract_fields" && !config.expectedFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedFields"],
        message: "Add at least one field to extract.",
      });
    }
    if (config.mode === "extract_rows" && !config.rowSchema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowSchema"],
        message: "Add at least one column for the extracted rows.",
      });
    }
    if (config.mode === "classify" && (!config.labels || config.labels.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["labels"],
        message: "Add the categories this document should be sorted into.",
      });
    }
    if (config.mode === "answer_questions" && !config.question) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["question"],
        message: "Add the question to answer about this document.",
      });
    }
  });

export type AnalyzeDocumentConfig = z.infer<typeof AnalyzeDocumentConfigSchema>;
