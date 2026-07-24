import {
  TransformRecordResultSchema,
  TransformRowsResultSchema,
  type UserDefinedSchema,
} from "@/contracts/aiProcessing";
import type { ModelTier } from "@/core/ai/modelTypes";
import { classifyTransformInput } from "@/core/workflows/transformInput";
import {
  AiTransientError,
  ExtractionValidationError,
  refusalError,
  TransformInputError,
} from "./analysisErrors";
import { executeAiAction } from "./executeAiAction";
import {
  blankLowConfidenceRows,
  validateExtractedRows,
  validateTransformedRecord,
} from "./extractionValidator";
import { MAX_OUTPUT_TOKENS } from "./resolveAnalysisDocument";
import {
  destinationWarnings,
  resolveTransformDestination,
  type ResolveTransformDestinationDeps,
  type TransformDestinationMode,
} from "./resolveTransformDestination";
import { tierForModelQuality } from "./runDocumentAnalysis";
import type { TransformDataProcessRequest } from "./types";

/**
 * `ai:transform_data` orchestrator (AI-PROVIDER-6 CS-6).
 *
 * Maps structured data from one shape into another. Owner decision 10 makes
 * "transform into another ChainReact action's fields" the PRIMARY path: every
 * registered action already declares a typed input surface, so the author
 * picks the destination step and the schema is derived rather than retyped.
 *
 * Like `runDocumentAnalysis`, this module owns NO billing, gating, routing, or
 * ledger logic — `executeAiAction` owns all of it (plan decision 12). Its only
 * privileges are the registry key, the tier, and the strict validator.
 *
 * Flow: input → classify/serialize → destination (re-derived server-side)
 * → executeAiAction → validated output → bounded workflow output. Nothing is
 * spent before both the input and the destination are known to be usable.
 */

export const TRANSFORM_DATA_ACTION_KEY = "ai:transform_data";

export type TransformOutputShape = "rows" | "record";

export interface RunDataTransformConfig {
  readonly input: unknown;
  readonly destinationMode: TransformDestinationMode;
  readonly destinationAction?: string | undefined;
  readonly destinationSchema?: UserDefinedSchema | undefined;
  readonly outputShape: TransformOutputShape;
  readonly instructions?: string | undefined;
  readonly confidenceThreshold: number;
  readonly onLowConfidence: "flag" | "fail" | "blank";
  readonly strictValidation: boolean;
  readonly maxRows: number;
  readonly modelQuality: "standard" | "advanced";
}

export interface RunDataTransformInput {
  readonly config: RunDataTransformConfig;
  readonly accountId: string;
  readonly userId: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly testMode?: boolean | undefined;
}

/**
 * Fixed output key set (plan §4.9 + the shared `lowConfidenceFields` surface
 * CS-5 established). Every key is present in BOTH output shapes — the
 * irrelevant one is `null` — so a downstream reference survives an author
 * switching between rows and record.
 */
export type DataTransformOutput = {
  readonly rows: readonly Record<string, unknown>[] | null;
  readonly rowCount: number | null;
  readonly record: Record<string, unknown> | null;
  readonly inputCount: number;
  readonly destination: string | null;
  readonly overallConfidence: number;
  readonly lowConfidenceFields: readonly string[];
  readonly warnings: readonly string[];
};

export interface RunDataTransformDeps extends ResolveTransformDestinationDeps {
  readonly execute?: typeof executeAiAction;
  readonly maxInputBytes?: number;
}

type TransformValue =
  | {
      kind: "rows";
      rows: readonly Record<string, unknown>[];
      lowConfidence: readonly string[];
      confidence: number;
    }
  | { kind: "record"; values: Record<string, unknown>; confidence: number };

type ValidationResult =
  | { ok: true; value: TransformValue }
  | { ok: false; issues: readonly string[] };

/** Zod issue paths only — never the offending value. */
function issueNames(error: { issues: readonly { path: (string | number)[] }[] }): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? issue.path.join(".") : "result",
  );
}

function buildValidator(
  config: RunDataTransformConfig,
  schema: UserDefinedSchema,
): (payload: unknown) => ValidationResult {
  return (payload: unknown): ValidationResult => {
    if (config.outputShape === "record") {
      const parsed = TransformRecordResultSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
      const validated = validateTransformedRecord(parsed.data, {
        schema,
        strict: config.strictValidation,
        confidenceThreshold: config.confidenceThreshold,
      });
      if (!validated.ok) return { ok: false, issues: validated.issues };
      return {
        ok: true,
        value: {
          kind: "record",
          values: validated.value.values,
          confidence: validated.value.overallConfidence,
        },
      };
    }

    const parsed = TransformRowsResultSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
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
        kind: "rows",
        rows: validated.value.rows,
        lowConfidence: validated.value.lowConfidence,
        confidence: validated.value.overallConfidence,
      },
    };
  };
}

export async function runDataTransform(
  input: RunDataTransformInput,
  deps: RunDataTransformDeps = {},
): Promise<DataTransformOutput> {
  const { config } = input;

  // 1. Input — classified and serialized ONCE, under a hard size cap. An
  //    unusable value never reaches the credit gate.
  const classified = classifyTransformInput(config.input, {
    ...(deps.maxInputBytes !== undefined ? { maxBytes: deps.maxInputBytes } : {}),
  });
  if (classified.kind === "unsupported") {
    throw new TransformInputError(
      `This step needs structured data from an earlier step — ${classified.reason}.`,
    );
  }

  // 2. Destination — re-derived from the LIVE registry, never from the client.
  const destination = resolveTransformDestination(
    {
      destinationMode: config.destinationMode,
      destinationAction: config.destinationAction,
      destinationSchema: config.destinationSchema,
    },
    deps,
  );

  const request: TransformDataProcessRequest = {
    task: "transform_data",
    ...(config.instructions ? { instructions: config.instructions } : {}),
    inputJson: classified.json,
    schema: destination.schema,
    outputShape: config.outputShape,
    ...(destination.context
      ? { destinationContext: destination.context as unknown as Record<string, unknown> }
      : {}),
    limits: { maxRows: config.maxRows, maxOutputTokens: MAX_OUTPUT_TOKENS },
  };

  const tier: ModelTier = tierForModelQuality(config.modelQuality);

  // 3. The shared pipeline. Never bypassed, never duplicated.
  const outcome = await (deps.execute ?? executeAiAction)<TransformValue>({
    actionKey: TRANSFORM_DATA_ACTION_KEY,
    accountId: input.accountId,
    userId: input.userId,
    workflowId: input.workflowId,
    workflowRunId: input.runId,
    ...(input.testMode !== undefined ? { testMode: input.testMode } : {}),
    requestedTier: tier,
    request,
    validate: buildValidator(config, destination.schema),
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

  // 4. Confidence policy — identical semantics to Analyze Document.
  const value = outcome.value;
  const lowConfidence =
    value.kind === "rows"
      ? value.lowConfidence
      : value.confidence < config.confidenceThreshold
        ? ["record"]
        : [];
  if (lowConfidence.length > 0 && config.onLowConfidence === "fail") {
    throw new Error(
      `The AI was not confident enough about ${lowConfidence.join(", ")}. Lower the confidence threshold, simplify the destination, or switch this step back to just flagging low confidence.`,
    );
  }
  const blank = lowConfidence.length > 0 && config.onLowConfidence === "blank";

  const warnings = destinationWarnings(destination.excludedFields);
  const base = {
    rows: null,
    rowCount: null,
    record: null,
    inputCount: classified.count,
    destination: destination.actionKey ?? null,
    overallConfidence: value.confidence,
    lowConfidenceFields: lowConfidence,
    warnings,
  } satisfies DataTransformOutput;

  if (value.kind === "rows") {
    const rows = blank
      ? blankLowConfidenceRows(value.rows, destination.schema, config.confidenceThreshold)
      : value.rows;
    return { ...base, rows, rowCount: rows.length };
  }

  const record = blank ? blankRecord(value.values, destination.schema) : value.values;
  return { ...base, record };
}

/** Null every declared key of a low-confidence record (`onLowConfidence: "blank"`). */
function blankRecord(
  values: Record<string, unknown>,
  schema: UserDefinedSchema,
): Record<string, unknown> {
  const blanked: Record<string, unknown> = { ...values };
  for (const field of schema.fields) blanked[field.name] = null;
  return blanked;
}
