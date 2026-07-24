/** @jest-environment node */
/**
 * AI-PROVIDER-7 (CS-7) — Suggest Fields through the REAL shared pipeline.
 *
 * `executeAiAction` is NOT stubbed: the real registry lookup, enabled-flag
 * check, tier resolution, credit pricing, gate ordering, routing seam, and
 * ledger write all run. Only the external model boundary and the two I/O
 * seams (credit gate, ledger) are injected.
 */
import {
  AiCreditsExhaustedError,
  ExtractionValidationError,
} from "@/services/ai/processor/analysisErrors";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import { executeAiAction } from "@/services/ai/processor/executeAiAction";
import {
  MAX_SUGGESTED_FIELDS,
  runSchemaSuggestion,
  SUGGEST_SCHEMA_ACTION_KEY,
  type RunSchemaSuggestionDeps,
} from "@/services/ai/processor/runSchemaSuggestion";
import type {
  AiProcessorClient,
  AiProcessRequest,
  AiProcessResult,
} from "@/services/ai/processor/types";

jest.mock("@/services/files/createWorkflowFilesStorageAdapter", () => ({
  createWorkflowFilesStorageAdapter: () => ({ download: jest.fn() }),
}));

interface Harness {
  deps: RunSchemaSuggestionDeps;
  requests: AiProcessRequest[];
  gateCalls: Record<string, unknown>[];
  completed: Record<string, unknown>[];
  failed: Record<string, unknown>[];
}

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
          ? { ok: true, charged: 1, used: 1, limit: 100 }
          : { ok: false, reason: "insufficient_ai_credits", used: 100, limit: 100 };
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

  return { requests, gateCalls, completed, failed, deps: { execute, maxInputChars: 100_000 } };
}

function ok(payload: unknown): AiProcessResult {
  return { ok: true, payload, modelTag: "test-model", source: "gateway" };
}

const PROPOSAL = {
  fields: [
    { name: "employee_name", type: "string", required: true, description: "Full name." },
    { name: "gross_pay", type: "currency" },
  ],
};

function run(deps: RunSchemaSuggestionDeps, sample: unknown = "Employee: Ada  Gross pay: $42") {
  return runSchemaSuggestion(
    {
      sample,
      accountId: "acct-1",
      userId: "user-1",
      workflowId: "wf-1",
      storageReason: "ai:suggest_schema workflow=wf-1 node=n1",
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

describe("proposal", () => {
  it("returns a validated schema plus the sampled document's name", async () => {
    const h = harness(ok(PROPOSAL));
    const outcome = await run(h.deps);
    expect(outcome.schema).toEqual(PROPOSAL);
    expect(outcome.sourceName).toBe("text-input.txt");
    expect(outcome.truncated).toBe(false);
  });

  it("sends the suggest_schema task with the parsed document and no schema", async () => {
    const h = harness(ok(PROPOSAL));
    await run(h.deps);
    const request = h.requests[0];
    if (request?.task !== "suggest_schema") throw new Error("wrong task");
    expect(request.document.segments[0]?.text).toContain("Employee: Ada");
    expect(request.limits.maxRows).toBe(MAX_SUGGESTED_FIELDS);
    expect(request).not.toHaveProperty("schema");
  });

  it("passes optional instructions through", async () => {
    const h = harness(ok(PROPOSAL));
    await runSchemaSuggestion(
      {
        sample: "text",
        instructions: "Only the line items",
        accountId: "acct-1",
        userId: "user-1",
        storageReason: "r",
      },
      h.deps,
    );
    expect(h.requests[0]).toMatchObject({ instructions: "Only the line items" });
  });

  it("reuses the document pipeline for a FileRef sample", async () => {
    const parse = jest.fn(async () => ({
      kind: "pages" as const,
      segments: [{ label: "Page 1", text: "Payroll" }],
      totalSegments: 1,
      truncated: false,
      charCount: 7,
      warnings: [],
    }));
    const h = harness(ok(PROPOSAL));
    const outcome = await run(
      {
        ...h.deps,
        fetchBytes: jest.fn(async () => ({
          bytes: new Uint8Array([1]),
          name: "payroll.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1,
        })) as never,
        detectFormat: jest.fn(() => "pdf") as never,
        parse: parse as never,
      },
      {
        kind: "v2_storage",
        name: "payroll.pdf",
        mimeType: "application/pdf",
        storagePath: "u/w/r/n/payroll.pdf",
      },
    );
    expect(parse).toHaveBeenCalledTimes(1);
    expect(outcome.sourceName).toBe("payroll.pdf");
  });
});

describe("billing + pipeline wiring", () => {
  it("uses the registered key and charges schema_suggestion at the fast tier", async () => {
    expect(SUGGEST_SCHEMA_ACTION_KEY).toBe("ai:suggest_schema");
    const h = harness(ok(PROPOSAL));
    await run(h.deps);
    expect(h.gateCalls).toHaveLength(1);
    expect(h.gateCalls[0]).toMatchObject({
      accountId: "acct-1",
      feature: "schema_suggestion",
      plannedTier: "fast",
    });
    expect(h.completed[0]).toMatchObject({
      feature: "schema_suggestion",
      workflowId: "wf-1",
      creditsCharged: 1,
    });
  });

  it("never calls the gate when the sample can't be read", async () => {
    const h = harness(ok(PROPOSAL));
    await expect(run(h.deps, 42)).rejects.toThrow();
    expect(h.gateCalls).toHaveLength(0);
    expect(h.requests).toHaveLength(0);
  });

  it("refuses when the processor flag is off", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    try {
      const h = harness(ok(PROPOSAL));
      await expect(run(h.deps)).rejects.toThrow(/not enabled/i);
      expect(h.gateCalls).toHaveLength(0);
    } finally {
      process.env[AI_PROCESSOR_ENV.enabled] = "true";
    }
  });

  it("raises the credits-exhausted error the route maps to 402", async () => {
    const h = harness(ok(PROPOSAL), false);
    await expect(run(h.deps)).rejects.toBeInstanceOf(AiCreditsExhaustedError);
    expect(h.requests).toHaveLength(0);
  });
});

describe("proposal validation", () => {
  it("rejects a duplicate field name (same contract as a hand-typed schema)", async () => {
    const h = harness(
      ok({
        fields: [
          { name: "total", type: "currency" },
          { name: "Total", type: "string" },
        ],
      }),
    );
    await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
    expect(h.failed).toHaveLength(1);
  });

  it("rejects an identifier-illegal name", async () => {
    for (const name of ["9lives", "gross pay", "gross-pay", ""]) {
      const h = harness(ok({ fields: [{ name, type: "string" }] }));
      await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
    }
  });

  it("rejects an unsupported type", async () => {
    const h = harness(ok({ fields: [{ name: "items", type: "array" }] }));
    await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  it("rejects a nested/object field shape", async () => {
    const h = harness(
      ok({ fields: [{ name: "address", type: "object", fields: [{ name: "city" }] }] }),
    );
    await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  it("rejects an empty proposal", async () => {
    const h = harness(ok({ fields: [] }));
    await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
  });

  it("rejects a reply that is not a schema at all", async () => {
    for (const payload of [null, "fields", { schema: PROPOSAL }, { fields: {} }]) {
      const h = harness(ok(payload));
      await expect(run(h.deps)).rejects.toBeInstanceOf(ExtractionValidationError);
    }
  });

  it("caps an over-eager proposal instead of failing the author", async () => {
    const many = {
      fields: Array.from({ length: MAX_SUGGESTED_FIELDS + 15 }, (_, i) => ({
        name: `field_${i}`,
        type: "string" as const,
      })),
    };
    const h = harness(ok(many));
    const outcome = await run(h.deps);
    expect(outcome.schema.fields).toHaveLength(MAX_SUGGESTED_FIELDS);
    expect(outcome.schema.fields[0]?.name).toBe("field_0");
  });

  it("names issues without echoing values", async () => {
    const h = harness(ok({ fields: [{ name: "9lives", type: "string" }] }));
    await expect(run(h.deps)).rejects.toThrow(/did not match the fields/);
  });
});

describe("failure mapping", () => {
  it("throws a TimeoutError-named error for retryable provider failures", async () => {
    const h = harness({
      ok: false,
      code: "TIMEOUT",
      retryable: true,
      message: "The AI service took too long.",
    });
    await expect(run(h.deps)).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("throws a plain error for a non-retryable provider failure", async () => {
    const h = harness({
      ok: false,
      code: "CONTENT_REFUSED",
      retryable: false,
      message: "The AI service declined this content.",
    });
    await expect(run(h.deps)).rejects.toThrow("The AI service declined this content.");
  });
});
