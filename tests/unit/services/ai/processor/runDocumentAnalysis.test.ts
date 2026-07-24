/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — Analyze Document end to end through the REAL
 * shared pipeline.
 *
 * `executeAiAction` is NOT stubbed: the real registry lookup, enabled-flag
 * check, tier resolution, credit pricing, gate ordering, routing seam, and
 * ledger write all run. Only the external model boundary (the processor
 * client) and the two I/O seams (credit gate, ledger) are injected — the
 * repo's E2E philosophy applied at unit scale.
 */
import { ROW_CONFIDENCE_KEY, type UserDefinedSchema } from "@/contracts/aiProcessing";
import { buildParsedDocument } from "@/core/documents/parsedDocument";
import {
  AiActionRefusedError,
  ExtractionValidationError,
} from "@/services/ai/processor/analysisErrors";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import { executeAiAction } from "@/services/ai/processor/executeAiAction";
import {
  ANALYZE_DOCUMENT_ACTION_KEY,
  runDocumentAnalysis,
  tierForModelQuality,
  type RunDocumentAnalysisConfig,
  type RunDocumentAnalysisDeps,
} from "@/services/ai/processor/runDocumentAnalysis";
import type {
  AiProcessorClient,
  AiProcessRequest,
  AiProcessResult,
} from "@/services/ai/processor/types";

jest.mock("@/services/files/createWorkflowFilesStorageAdapter", () => ({
  createWorkflowFilesStorageAdapter: () => ({ download: jest.fn() }),
}));

const FIELDS_SCHEMA: UserDefinedSchema = {
  fields: [
    { name: "invoice_total", type: "currency", required: true },
    { name: "due_date", type: "date" },
  ],
};
const ROWS_SCHEMA: UserDefinedSchema = {
  fields: [
    { name: "description", type: "string", required: true },
    { name: "amount", type: "currency", required: true },
  ],
};

function baseConfig(
  overrides: Partial<RunDocumentAnalysisConfig> = {},
): RunDocumentAnalysisConfig {
  return {
    file: "Invoice total: $1,200.00 due 7/31/2026",
    mode: "summarize",
    allowOtherLabel: true,
    confidenceThreshold: 0.7,
    onLowConfidence: "flag",
    strictValidation: true,
    maxRows: 100,
    modelQuality: "standard",
    ...overrides,
  };
}

interface Harness {
  deps: RunDocumentAnalysisDeps;
  requests: AiProcessRequest[];
  gateCalls: Record<string, unknown>[];
  completed: Record<string, unknown>[];
  failed: Record<string, unknown>[];
}

/** Real pipeline; only the model boundary + gate + ledger are injected. */
function harness(result: AiProcessResult, gateOk = true): Harness {
  const requests: AiProcessRequest[] = [];
  const gateCalls: Record<string, unknown>[] = [];
  const completed: Record<string, unknown>[] = [];
  const failed: Record<string, unknown>[] = [];

  const client: AiProcessorClient = {
    async process(request) {
      requests.push(request);
      return result;
    },
  };

  const execute: typeof executeAiAction = (input) =>
    executeAiAction(input, {
      gate: (async (args: Record<string, unknown>) => {
        gateCalls.push(args);
        return gateOk
          ? { ok: true, charged: 3, skipped: undefined }
          : { ok: false, reason: "insufficient_ai_credits" };
      }) as never,
      createClient: () => client,
      ledger: {
        async recordCompleted(input) {
          completed.push(input as unknown as Record<string, unknown>);
        },
        async recordFailed(input) {
          failed.push(input as unknown as Record<string, unknown>);
        },
      },
    });

  return {
    requests,
    gateCalls,
    completed,
    failed,
    deps: { execute, maxInputChars: 100_000 },
  };
}

function ok(payload: unknown): AiProcessResult {
  return { ok: true, payload, modelTag: "test-model", source: "gateway" };
}

function run(config: RunDocumentAnalysisConfig, deps: RunDocumentAnalysisDeps) {
  return runDocumentAnalysis(
    {
      config,
      accountId: "acct-1",
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
    },
    deps,
  );
}

const originalFlag = process.env[AI_PROCESSOR_ENV.enabled];
beforeAll(() => {
  process.env[AI_PROCESSOR_ENV.enabled] = "true";
});
afterAll(() => {
  if (originalFlag === undefined) delete process.env[AI_PROCESSOR_ENV.enabled];
  else process.env[AI_PROCESSOR_ENV.enabled] = originalFlag;
});

describe("mode outputs", () => {
  it("summarize", async () => {
    const h = harness(ok({ summary: "A June invoice.", keyPoints: ["$1,200 due"], overallConfidence: 0.88 }));
    const output = await run(baseConfig(), h.deps);
    expect(output.mode).toBe("summarize");
    expect(output.summary).toBe("A June invoice.");
    expect(output.keyPoints).toEqual(["$1,200 due"]);
    expect(output.overallConfidence).toBe(0.88);
    expect(output.fields).toBeNull();
    expect(output.rows).toBeNull();
    expect(output.label).toBeNull();
    expect(output.answer).toBeNull();
  });

  it("extract_fields coerces through the extraction validator", async () => {
    const h = harness(
      ok({
        fields: {
          invoice_total: { value: "$1,200.00", confidence: 0.95 },
          due_date: { value: "7/31/2026", confidence: 0.4 },
        },
        overallConfidence: 0.8,
      }),
    );
    const output = await run(
      baseConfig({ mode: "extract_fields", expectedFields: FIELDS_SCHEMA }),
      h.deps,
    );
    expect(output.fields).toEqual({ invoice_total: 1200, due_date: "2026-07-31" });
    expect(output.lowConfidenceFields).toEqual(["due_date"]);
    expect(output.rows).toBeNull();
  });

  it("extract_rows returns flat rows plus the reserved per-row confidence", async () => {
    const h = harness(
      ok({
        rows: [
          { description: "Widget", amount: "$10.00", [ROW_CONFIDENCE_KEY]: 0.9 },
          { description: "Gadget", amount: "$5.50", [ROW_CONFIDENCE_KEY]: 0.9 },
        ],
        overallConfidence: 0.9,
      }),
    );
    const output = await run(
      baseConfig({ mode: "extract_rows", rowSchema: ROWS_SCHEMA }),
      h.deps,
    );
    expect(output.rows).toEqual([
      { description: "Widget", amount: 10, [ROW_CONFIDENCE_KEY]: 0.9 },
      { description: "Gadget", amount: 5.5, [ROW_CONFIDENCE_KEY]: 0.9 },
    ]);
    expect(output.rowCount).toBe(2);
  });

  it("classify", async () => {
    const h = harness(ok({ label: "Invoice", confidence: 0.77 }));
    const output = await run(
      baseConfig({ mode: "classify", labels: ["Invoice", "Receipt"] }),
      h.deps,
    );
    expect(output.label).toBe("Invoice");
    expect(output.overallConfidence).toBe(0.77);
  });

  it("answer_questions", async () => {
    const h = harness(ok({ answer: "$1,200.00, due July 31.", confidence: 0.82 }));
    const output = await run(
      baseConfig({ mode: "answer_questions", question: "How much is due?" }),
      h.deps,
    );
    expect(output.answer).toBe("$1,200.00, due July 31.");
  });

  it("always returns the same key set regardless of mode", async () => {
    const h = harness(ok({ label: "Invoice", confidence: 0.9 }));
    const output = await run(baseConfig({ mode: "classify", labels: ["Invoice"] }), h.deps);
    expect(Object.keys(output).sort()).toEqual(
      [
        "answer",
        "detectedType",
        "fields",
        "keyPoints",
        "label",
        "lowConfidenceFields",
        "mode",
        "overallConfidence",
        "pageRangeApplied",
        "rowCount",
        "rows",
        "segmentsAnalyzed",
        "sourceName",
        "summary",
        "truncated",
        "warnings",
      ].sort(),
    );
  });
});

describe("processor request", () => {
  it("sends the mode, document, and per-mode payload only", async () => {
    const h = harness(
      ok({ fields: { invoice_total: { value: 1, confidence: 1 }, due_date: { value: null, confidence: 1 } }, overallConfidence: 1 }),
    );
    await run(
      baseConfig({
        mode: "extract_fields",
        expectedFields: FIELDS_SCHEMA,
        instructions: "Only the second page",
        question: "ignored outside answer mode",
        labels: ["ignored"],
        maxRows: 25,
      }),
      h.deps,
    );
    const request = h.requests[0];
    expect(request).toMatchObject({
      task: "analyze_document",
      mode: "extract_fields",
      instructions: "Only the second page",
      schema: FIELDS_SCHEMA,
      limits: { maxRows: 25 },
    });
    // Cross-mode fields never leak into a request they do not belong to.
    expect(request).not.toHaveProperty("question");
    expect(request).not.toHaveProperty("labels");
  });

  it("sends labels + allowOtherLabel only for classify, question only for answers", async () => {
    const classify = harness(ok({ label: "A", confidence: 1 }));
    await run(
      baseConfig({ mode: "classify", labels: ["A", "B"], allowOtherLabel: false }),
      classify.deps,
    );
    expect(classify.requests[0]).toMatchObject({
      labels: ["A", "B"],
      allowOtherLabel: false,
    });

    const answers = harness(ok({ answer: "yes", confidence: 1 }));
    await run(
      baseConfig({ mode: "answer_questions", question: "Is it paid?" }),
      answers.deps,
    );
    expect(answers.requests[0]).toMatchObject({ question: "Is it paid?" });
    expect(answers.requests[0]).not.toHaveProperty("schema");
  });

  it("passes the parsed document text through, never the raw config value", async () => {
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
    await run(
      baseConfig({
        file: buildParsedDocument({
          kind: "pages",
          segments: [{ label: "Page 2", text: "second page text" }],
        }),
      }),
      h.deps,
    );
    const request = h.requests[0];
    if (request?.task !== "analyze_document") throw new Error("wrong task");
    expect(request.document.segments).toEqual([
      { label: "Page 2", text: "second page text" },
    ]);
  });
});

describe("billing + pipeline wiring", () => {
  it("charges the document_analysis feature at the fast tier by default", async () => {
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
    await run(baseConfig(), h.deps);
    expect(h.gateCalls).toHaveLength(1);
    expect(h.gateCalls[0]).toMatchObject({
      accountId: "acct-1",
      feature: "document_analysis",
      plannedTier: "fast",
    });
    expect(h.completed).toHaveLength(1);
    expect(h.completed[0]).toMatchObject({
      feature: "document_analysis",
      workflowId: "wf-1",
      workflowRunId: "run-1",
      creditsCharged: 3,
    });
  });

  it("maps the higher-quality choice onto the strong tier", async () => {
    expect(tierForModelQuality("standard")).toBe("fast");
    expect(tierForModelQuality("advanced")).toBe("strong");
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
    await run(baseConfig({ modelQuality: "advanced" }), h.deps);
    expect(h.gateCalls[0]).toMatchObject({ plannedTier: "strong" });
  });

  it("uses the registered action key (the registry is what makes the call legal)", async () => {
    expect(ANALYZE_DOCUMENT_ACTION_KEY).toBe("ai:analyze_document");
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
    await run(baseConfig(), h.deps);
    // A gate call proves the registry lookup + flag + tier + price stages
    // all passed for this exact key inside the REAL pipeline.
    expect(h.gateCalls).toHaveLength(1);
  });

  it("never calls the gate when the document cannot be read", async () => {
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
    await expect(run(baseConfig({ file: 42 }), h.deps)).rejects.toThrow();
    expect(h.gateCalls).toHaveLength(0);
    expect(h.requests).toHaveLength(0);
  });

  it("refuses when the shared pipeline refuses credits", async () => {
    const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }), false);
    await expect(run(baseConfig(), h.deps)).rejects.toBeInstanceOf(AiActionRefusedError);
    expect(h.requests).toHaveLength(0);
  });

  it("refuses when the processor flag is off", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    try {
      const h = harness(ok({ summary: "s", keyPoints: [], overallConfidence: 1 }));
      await expect(run(baseConfig(), h.deps)).rejects.toThrow(/not enabled/i);
      expect(h.gateCalls).toHaveLength(0);
    } finally {
      process.env[AI_PROCESSOR_ENV.enabled] = "true";
    }
  });
});

describe("failure mapping", () => {
  it("throws a TimeoutError-named error for retryable provider failures", async () => {
    const h = harness({
      ok: false,
      code: "RATE_LIMITED",
      retryable: true,
      message: "The AI service is busy.",
    });
    await expect(run(baseConfig(), h.deps)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("throws a plain error for non-retryable provider failures", async () => {
    const h = harness({
      ok: false,
      code: "CONTENT_REFUSED",
      retryable: false,
      message: "The AI service declined this content.",
    });
    await expect(run(baseConfig(), h.deps)).rejects.toThrow("The AI service declined this content.");
  });

  it("throws ExtractionValidationError naming fields when the result misses a required value", async () => {
    const h = harness(
      ok({
        fields: {
          invoice_total: { value: null, confidence: 0.9 },
          due_date: { value: null, confidence: 0.9 },
        },
        overallConfidence: 0.9,
      }),
    );
    const promise = run(
      baseConfig({ mode: "extract_fields", expectedFields: FIELDS_SCHEMA }),
      h.deps,
    );
    await expect(promise).rejects.toBeInstanceOf(ExtractionValidationError);
    await expect(promise).rejects.toThrow(/invoice_total/);
    expect(h.failed).toHaveLength(1);
  });

  it("throws when the model reply does not match the mode envelope", async () => {
    const h = harness(ok({ nonsense: true }));
    await expect(run(baseConfig(), h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
  });
});

describe("low-confidence policy", () => {
  const lowFields = ok({
    fields: {
      invoice_total: { value: "$5", confidence: 0.2 },
      due_date: { value: null, confidence: 0.9 },
    },
    overallConfidence: 0.3,
  });

  it("flags by default without failing", async () => {
    const h = harness(lowFields);
    const output = await run(
      baseConfig({ mode: "extract_fields", expectedFields: FIELDS_SCHEMA }),
      h.deps,
    );
    expect(output.lowConfidenceFields).toEqual(["invoice_total"]);
    expect(output.fields).toEqual({ invoice_total: 5, due_date: null });
  });

  it("stops the run when the author opted into failing", async () => {
    const h = harness(lowFields);
    await expect(
      run(
        baseConfig({
          mode: "extract_fields",
          expectedFields: FIELDS_SCHEMA,
          onLowConfidence: "fail",
        }),
        h.deps,
      ),
    ).rejects.toThrow(/not confident enough about invoice_total/);
  });

  it("blanks the flagged values when the author opted into blanking", async () => {
    const h = harness(lowFields);
    const output = await run(
      baseConfig({
        mode: "extract_fields",
        expectedFields: FIELDS_SCHEMA,
        onLowConfidence: "blank",
        strictValidation: false,
      }),
      h.deps,
    );
    expect(output.fields).toEqual({ invoice_total: null, due_date: null });
  });

  it("applies to single-value modes too", async () => {
    const h = harness(ok({ label: "Invoice", confidence: 0.1 }));
    const output = await run(
      baseConfig({ mode: "classify", labels: ["Invoice"], onLowConfidence: "blank" }),
      h.deps,
    );
    expect(output.lowConfidenceFields).toEqual(["label"]);
    expect(output.label).toBeNull();
  });
});
