import { z } from "zod";

import {
  INSTRUCTIONS_MAX_CHARS,
  UserDefinedSchemaSchema,
} from "@/contracts/aiProcessing";
import {
  AnalyzeDocumentModelQualitySchema,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_ROWS,
  MAX_ROWS_CAP,
  OnLowConfidenceSchema,
} from "./analyzeDocument.schema";

/**
 * Resolved-config contract for `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * `.strict()` — an undeclared key is a config bug, not something to forward to
 * a paid model call.
 *
 * `input` is deliberately `unknown`: a single-token template resolves to the
 * RAW upstream value, which may be an array of rows, one record, an Analyze
 * Document output, or any other JSON-compatible workflow variable. Typing it
 * here would reject legitimate shapes with a Zod message that means nothing to
 * a workflow author; `classifyTransformInput` refuses the genuinely unusable
 * ones with copy that names the remedy.
 *
 * The quality / confidence / limit vocabulary is shared with Analyze Document
 * rather than re-declared — one AI action must not drift from the other on
 * what "higher quality" or "when confidence is low" means.
 */

export const TransformDestinationModeSchema = z.enum(["action", "custom"]);
export type TransformDestinationMode = z.infer<typeof TransformDestinationModeSchema>;

export const TransformOutputShapeSchema = z.enum(["rows", "record"]);
export type TransformOutputShape = z.infer<typeof TransformOutputShapeSchema>;

/** `${provider}:${type}` — the same key shape the discovery registry uses. */
export const DESTINATION_ACTION_KEY_PATTERN = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_]*$/;

export const TransformDataConfigSchema = z
  .object({
    /** Array · record · Analyze Document output · any JSON-compatible value. */
    input: z.unknown(),

    destinationMode: TransformDestinationModeSchema,

    /** destinationMode "action" — a registered `${provider}:${type}` key. */
    destinationAction: z
      .string()
      .trim()
      .regex(
        DESTINATION_ACTION_KEY_PATTERN,
        "Pick the step this data is headed for.",
      )
      .optional(),

    /** destinationMode "custom" — the author's own field list. */
    destinationSchema: UserDefinedSchemaSchema.optional(),

    outputShape: TransformOutputShapeSchema,

    instructions: z.string().max(INSTRUCTIONS_MAX_CHARS).optional(),

    // ── Advanced ────────────────────────────────────────────────────────
    confidenceThreshold: z
      .number()
      .min(0)
      .max(1)
      .default(DEFAULT_CONFIDENCE_THRESHOLD),
    onLowConfidence: OnLowConfidenceSchema.default("flag"),
    strictValidation: z.boolean().default(true),
    maxRows: z.number().int().min(1).max(MAX_ROWS_CAP).default(DEFAULT_MAX_ROWS),
    modelQuality: AnalyzeDocumentModelQualitySchema.default("standard"),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.destinationMode === "action" && !config.destinationAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationAction"],
        message: "Choose the step this data should be transformed for.",
      });
    }
    if (config.destinationMode === "custom" && !config.destinationSchema) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationSchema"],
        message: "Add at least one field for the transformed data.",
      });
    }
  });

export type TransformDataConfig = z.infer<typeof TransformDataConfigSchema>;
