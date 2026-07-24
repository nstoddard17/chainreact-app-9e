import {
  AnswerQuestionsResultSchema,
  ClassifyResultSchema,
  ExtractFieldsResultSchema,
  ExtractRowsResultSchema,
  SummarizeResultSchema,
  type DocumentAnalysisMode,
  type UserDefinedSchema,
} from "@/contracts/aiProcessing";
import type { ModelTier } from "@/core/ai/modelTypes";
import {
  AiTransientError,
  ExtractionValidationError,
  refusalError,
} from "./analysisErrors";
import { executeAiAction } from "./executeAiAction";
import {
  blankLowConfidenceRows,
  validateExtractedFields,
  validateExtractedRows,
} from "./extractionValidator";
import {
  MAX_OUTPUT_TOKENS,
  resolveAnalysisDocument,
  type ResolveAnalysisDocumentDeps,
} from "./resolveAnalysisDocument";
import type { AnalyzeDocumentProcessRequest } from "./types";

/**
 * `ai:analyze_document` orchestrator (AI-PROVIDER-5 CS-5).
 *
 * The one place the five analysis modes turn into a processor request and
 * back into a bounded workflow output. It owns NO billing, gating, routing,
 * or ledger logic — `executeAiAction` owns all of that (plan decision 12),
 * and this module's only privilege is choosing the registry key, the tier,
 * and the strict validator.
 *
 * Flow:  input → parser → ParsedDocument → executeAiAction → validated
 * output → workflow outputs. Nothing skips a step, and nothing is spent
 * before the document is known to be readable.
 */

export const ANALYZE_DOCUMENT_ACTION_KEY = "ai:analyze_document";

/** Builder-facing quality label → the internal model tier. One boundary. */
export function tierForModelQuality(quality: "standard" | "advanced"): ModelTier {
  return quality === "advanced" ? "strong" : "fast";
}

export interface RunDocumentAnalysisConfig {
  readonly file: unknown;
  readonly mode: DocumentAnalysisMode;
  readonly instructions?: string | undefined;
  readonly expectedFields?: UserDefinedSchema | undefined;
  readonly rowSchema?: UserDefinedSchema | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly allowOtherLabel: boolean;
  readonly question?: string | undefined;
  readonly pageRange?: string | undefined;
  readonly sheetName?: string | undefined;
  readonly maxPages?: number | undefined;
  readonly confidenceThreshold: number;
  readonly onLowConfidence: "flag" | "fail" | "blank";
  readonly strictValidation: boolean;
  readonly maxRows: number;
  readonly modelQuality: "standard" | "advanced";
}

export interface RunDocumentAnalysisInput {
  readonly config: RunDocumentAnalysisConfig;
  readonly accountId: string;
  readonly userId: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly testMode?: boolean | undefined;
}

/**
 * Fixed output key set — every key is present on EVERY mode (irrelevant
 * ones are `null`), so a downstream reference never breaks when the author
 * switches mode, and the variable picker has one stable surface.
 */
export type DocumentAnalysisOutput = {
  readonly mode: DocumentAnalysisMode;
  readonly sourceName: string;
  readonly detectedType: string;
  readonly summary: string | null;
  readonly keyPoints: readonly string[] | null;
  readonly fields: Record<string, unknown> | null;
  readonly rows: readonly Record<string, unknown>[] | null;
  readonly rowCount: number | null;
  readonly label: string | null;
  readonly answer: string | null;
  readonly overallConfidence: number;
  readonly lowConfidenceFields: readonly string[];
  readonly truncated: boolean;
  readonly pageRangeApplied: boolean;
  readonly segmentsAnalyzed: number;
  readonly warnings: readonly string[];
};

export interface RunDocumentAnalysisDeps extends ResolveAnalysisDocumentDeps {
  readonly execute?: typeof executeAiAction;
}

/** What the strict validator hands back, before output mapping. */
type AnalysisValue =
  | { kind: "summarize"; summary: string; keyPoints: string[]; confidence: number }
  | {
      kind: "extract_fields";
      values: Record<string, unknown>;
      lowConfidence: readonly string[];
      confidence: number;
    }
  | {
      kind: "extract_rows";
      rows: readonly Record<string, unknown>[];
      lowConfidence: readonly string[];
      confidence: number;
    }
  | { kind: "classify"; label: string; confidence: number }
  | { kind: "answer_questions"; answer: string; confidence: number };

type ValidationResult =
  | { ok: true; value: AnalysisValue }
  | { ok: false; issues: readonly string[] };

/** Zod issue paths only — never the offending value. */
function issueNames(error: { issues: readonly { path: (string | number)[] }[] }): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? issue.path.join(".") : "result",
  );
}

function buildValidator(
  config: RunDocumentAnalysisConfig,
): (payload: unknown) => ValidationResult {
  return (payload: unknown): ValidationResult => {
    switch (config.mode) {
      case "summarize": {
        const parsed = SummarizeResultSchema.safeParse(payload);
        if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
        return {
          ok: true,
          value: {
            kind: "summarize",
            summary: parsed.data.summary,
            keyPoints: parsed.data.keyPoints,
            confidence: parsed.data.overallConfidence,
          },
        };
      }
      case "extract_fields": {
        const parsed = ExtractFieldsResultSchema.safeParse(payload);
        if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
        const schema = config.expectedFields;
        if (!schema) return { ok: false, issues: ["expectedFields"] };
        const validated = validateExtractedFields(parsed.data, {
          schema,
          strict: config.strictValidation,
          confidenceThreshold: config.confidenceThreshold,
        });
        if (!validated.ok) return { ok: false, issues: validated.issues };
        return {
          ok: true,
          value: {
            kind: "extract_fields",
            values: validated.value.values,
            lowConfidence: validated.value.lowConfidence,
            confidence: validated.value.overallConfidence,
          },
        };
      }
      case "extract_rows": {
        const parsed = ExtractRowsResultSchema.safeParse(payload);
        if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
        const schema = config.rowSchema;
        if (!schema) return { ok: false, issues: ["rowSchema"] };
        const validated = validateExtractedRows(parsed.data, {
          schema,
          strict: config.strictValidation,
          confidenceThreshold: config.confidenceThreshold,
          maxRows: config.maxRows,
        });
        if (!validated.ok) return { ok: false, issues: validated.issues };
        return {
          ok: true,
          value: {
            kind: "extract_rows",
            rows: validated.value.rows,
            lowConfidence: validated.value.lowConfidence,
            confidence: validated.value.overallConfidence,
          },
        };
      }
      case "classify": {
        const parsed = ClassifyResultSchema.safeParse(payload);
        if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
        return {
          ok: true,
          value: {
            kind: "classify",
            label: parsed.data.label,
            confidence: parsed.data.confidence,
          },
        };
      }
      case "answer_questions": {
        const parsed = AnswerQuestionsResultSchema.safeParse(payload);
        if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
        return {
          ok: true,
          value: {
            kind: "answer_questions",
            answer: parsed.data.answer,
            confidence: parsed.data.confidence,
          },
        };
      }
    }
  };
}

function buildRequest(
  config: RunDocumentAnalysisConfig,
  document: AnalyzeDocumentProcessRequest["document"],
): AnalyzeDocumentProcessRequest {
  const schema =
    config.mode === "extract_fields"
      ? config.expectedFields
      : config.mode === "extract_rows"
        ? config.rowSchema
        : undefined;

  return {
    task: "analyze_document",
    mode: config.mode,
    ...(config.instructions ? { instructions: config.instructions } : {}),
    ...(config.mode === "answer_questions" && config.question
      ? { question: config.question }
      : {}),
    document,
    ...(schema ? { schema } : {}),
    ...(config.mode === "classify" && config.labels
      ? { labels: config.labels, allowOtherLabel: config.allowOtherLabel }
      : {}),
    limits: { maxRows: config.maxRows, maxOutputTokens: MAX_OUTPUT_TOKENS },
  };
}

/** Which output names the low-confidence policy applies to, per mode. */
function lowConfidenceNames(
  value: AnalysisValue,
  threshold: number,
): readonly string[] {
  switch (value.kind) {
    case "extract_fields":
    case "extract_rows":
      return value.lowConfidence;
    case "summarize":
      return value.confidence < threshold ? ["summary"] : [];
    case "classify":
      return value.confidence < threshold ? ["label"] : [];
    case "answer_questions":
      return value.confidence < threshold ? ["answer"] : [];
  }
}

export async function runDocumentAnalysis(
  input: RunDocumentAnalysisInput,
  deps: RunDocumentAnalysisDeps = {},
): Promise<DocumentAnalysisOutput> {
  const { config } = input;

  // 1. Input → parser → ParsedDocument (throws typed config errors).
  const resolved = await resolveAnalysisDocument(
    {
      value: config.file,
      mode: config.mode,
      pageRange: config.pageRange,
      sheetName: config.sheetName,
      maxPages: config.maxPages,
      storageReason: `ai:analyze_document run=${input.runId} node=${input.nodeId}`,
    },
    deps,
  );

  // 2. The shared pipeline: registry → flag → tier → price → credit gate →
  //    route → model → our strict validator → ledger. Never bypassed.
  const outcome = await (deps.execute ?? executeAiAction)<AnalysisValue>({
    actionKey: ANALYZE_DOCUMENT_ACTION_KEY,
    accountId: input.accountId,
    userId: input.userId,
    workflowId: input.workflowId,
    workflowRunId: input.runId,
    ...(input.testMode !== undefined ? { testMode: input.testMode } : {}),
    requestedTier: tierForModelQuality(config.modelQuality),
    request: buildRequest(config, resolved.payload),
    validate: buildValidator(config),
  });

  if (outcome.status === "preflight_refused") {
    throw refusalError(outcome);
  }
  if (outcome.status === "provider_failed") {
    if (outcome.retryable) throw new AiTransientError(outcome.message);
    throw new Error(outcome.message);
  }
  if (outcome.status === "invalid_output") {
    throw new ExtractionValidationError(outcome.issues);
  }

  // 3. Confidence policy. Low confidence is NOT an error by default — the
  //    author opts into strictness per step.
  const value = outcome.value;
  const lowConfidence = lowConfidenceNames(value, config.confidenceThreshold);
  if (lowConfidence.length > 0 && config.onLowConfidence === "fail") {
    throw new Error(
      `The AI was not confident enough about ${lowConfidence.join(", ")}. Lower the confidence threshold, narrow the document, or switch this step back to just flagging low confidence.`,
    );
  }
  const blank = lowConfidence.length > 0 && config.onLowConfidence === "blank";

  return buildOutput({ config, resolved, value, lowConfidence, blank });
}

function buildOutput(input: {
  config: RunDocumentAnalysisConfig;
  resolved: Awaited<ReturnType<typeof resolveAnalysisDocument>>;
  value: AnalysisValue;
  lowConfidence: readonly string[];
  blank: boolean;
}): DocumentAnalysisOutput {
  const { config, resolved, value, lowConfidence, blank } = input;
  const base = {
    mode: config.mode,
    sourceName: resolved.payload.name,
    detectedType: resolved.detectedType,
    summary: null,
    keyPoints: null,
    fields: null,
    rows: null,
    rowCount: null,
    label: null,
    answer: null,
    overallConfidence: value.confidence,
    lowConfidenceFields: lowConfidence,
    truncated: resolved.truncated,
    pageRangeApplied: resolved.pageRangeApplied,
    segmentsAnalyzed: resolved.segmentsAnalyzed,
    warnings: resolved.warnings,
  } satisfies DocumentAnalysisOutput;

  switch (value.kind) {
    case "summarize":
      return {
        ...base,
        summary: blank ? null : value.summary,
        keyPoints: blank ? [] : value.keyPoints,
      };
    case "extract_fields": {
      const values = blank ? { ...value.values } : value.values;
      if (blank) for (const name of lowConfidence) values[name] = null;
      return { ...base, fields: values };
    }
    case "extract_rows": {
      const rows =
        blank && config.rowSchema
          ? blankLowConfidenceRows(value.rows, config.rowSchema, config.confidenceThreshold)
          : value.rows;
      return { ...base, rows, rowCount: rows.length };
    }
    case "classify":
      return { ...base, label: blank ? null : value.label };
    case "answer_questions":
      return { ...base, answer: blank ? null : value.answer };
  }
}
