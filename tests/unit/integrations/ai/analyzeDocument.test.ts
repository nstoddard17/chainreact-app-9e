/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — `ai:analyze_document` config contract + handler.
 *
 * The runtime twin of the builder's conditional-field rules: a config
 * assembled outside the builder (AI planner, template, API) is held to the
 * same per-mode requirements the config panel enforces visually.
 */
import { analyzeDocument } from "@/integrations/ai/actions/analyzeDocument";
import {
  AnalyzeDocumentConfigSchema,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_ROWS,
} from "@/integrations/ai/actions/analyzeDocument.schema";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const runDocumentAnalysis = jest.fn();
jest.mock("@/services/ai/processor/runDocumentAnalysis", () => ({
  runDocumentAnalysis: (...args: unknown[]) => runDocumentAnalysis(...args),
}));

const SCHEMA = { fields: [{ name: "total", type: "currency" as const, required: true }] };

function config(overrides: Record<string, unknown> = {}) {
  return { file: "some text", mode: "summarize", ...overrides };
}

beforeEach(() => {
  runDocumentAnalysis.mockReset();
  runDocumentAnalysis.mockResolvedValue({ mode: "summarize", summary: "s" });
});

describe("config schema", () => {
  it("applies the documented defaults", () => {
    const parsed = AnalyzeDocumentConfigSchema.parse(config());
    expect(parsed).toMatchObject({
      allowOtherLabel: true,
      confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      onLowConfidence: "flag",
      strictValidation: true,
      maxRows: DEFAULT_MAX_ROWS,
      modelQuality: "standard",
    });
  });

  it("rejects undeclared keys", () => {
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ prompt: "raw" })).success).toBe(
      false,
    );
  });

  it("accepts any document shape and lets the resolver judge it", () => {
    for (const file of ["text", { kind: "v2_storage" }, undefined, 42]) {
      expect(AnalyzeDocumentConfigSchema.safeParse(config({ file })).success).toBe(true);
    }
  });

  it("requires a schema for extract_fields", () => {
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ mode: "extract_fields" })).success).toBe(
      false,
    );
    expect(
      AnalyzeDocumentConfigSchema.safeParse(
        config({ mode: "extract_fields", expectedFields: SCHEMA }),
      ).success,
    ).toBe(true);
  });

  it("requires a schema for extract_rows", () => {
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ mode: "extract_rows" })).success).toBe(
      false,
    );
    expect(
      AnalyzeDocumentConfigSchema.safeParse(config({ mode: "extract_rows", rowSchema: SCHEMA }))
        .success,
    ).toBe(true);
  });

  it("requires labels for classify", () => {
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ mode: "classify" })).success).toBe(false);
    expect(
      AnalyzeDocumentConfigSchema.safeParse(config({ mode: "classify", labels: ["A"] })).success,
    ).toBe(true);
  });

  it("requires a question for answer_questions", () => {
    expect(
      AnalyzeDocumentConfigSchema.safeParse(config({ mode: "answer_questions" })).success,
    ).toBe(false);
    expect(
      AnalyzeDocumentConfigSchema.safeParse(
        config({ mode: "answer_questions", question: "How much?" }),
      ).success,
    ).toBe(true);
  });

  it("does not require the OTHER modes' fields", () => {
    // A summarize step needs neither a schema, nor labels, nor a question.
    expect(AnalyzeDocumentConfigSchema.safeParse(config()).success).toBe(true);
  });

  it("bounds the advanced numeric knobs", () => {
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ maxRows: 501 })).success).toBe(false);
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ maxPages: 0 })).success).toBe(false);
    expect(
      AnalyzeDocumentConfigSchema.safeParse(config({ confidenceThreshold: 1.5 })).success,
    ).toBe(false);
    expect(AnalyzeDocumentConfigSchema.safeParse(config({ modelQuality: "best" })).success).toBe(
      false,
    );
  });
});

describe("handler", () => {
  const triggerEvent = { provider: "native", eventType: "manual" } as unknown as TriggerEvent;

  it("passes the run scope and parsed config to the orchestrator, and returns its output", async () => {
    const result = await analyzeDocument({
      workflowId: "wf-1",
      userId: "user-1",
      accountId: "acct-1",
      runId: "run-1",
      nodeId: "node-1",
      config: config({ mode: "extract_rows", rowSchema: SCHEMA, maxPages: 3 }),
      triggerEvent,
      testMode: true,
    });

    expect(runDocumentAnalysis).toHaveBeenCalledTimes(1);
    const input = runDocumentAnalysis.mock.calls[0][0];
    expect(input).toMatchObject({
      accountId: "acct-1",
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      testMode: true,
    });
    expect(input.config).toMatchObject({
      mode: "extract_rows",
      rowSchema: SCHEMA,
      maxPages: 3,
      strictValidation: true,
      maxRows: DEFAULT_MAX_ROWS,
    });
    expect(result.output).toEqual({ mode: "summarize", summary: "s" });
  });

  it("throws on an invalid config instead of calling the orchestrator", async () => {
    await expect(
      analyzeDocument({
        workflowId: "wf-1",
        userId: "user-1",
        accountId: "acct-1",
        runId: "run-1",
        nodeId: "node-1",
        config: config({ mode: "classify" }),
        triggerEvent,
      }),
    ).rejects.toThrow();
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });
});
