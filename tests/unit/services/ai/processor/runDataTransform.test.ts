/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — Transform Data end to end through the REAL shared
 * pipeline.
 *
 * `executeAiAction` is NOT stubbed: the real registry lookup, enabled-flag
 * check, tier resolution, credit pricing, gate ordering, routing seam, and
 * ledger write all run. Only the external model boundary and the two I/O seams
 * (credit gate, ledger) are injected.
 */
import { ROW_CONFIDENCE_KEY, type UserDefinedSchema } from "@/contracts/aiProcessing";
import {
  AiActionRefusedError,
  AiCreditsExhaustedError,
  DestinationResolutionError,
  ExtractionValidationError,
  TransformInputError,
} from "@/services/ai/processor/analysisErrors";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import { executeAiAction } from "@/services/ai/processor/executeAiAction";
import { DESTINATION_EXCLUDED_WARNING_PREFIX } from "@/services/ai/processor/resolveTransformDestination";
import {
  runDataTransform,
  TRANSFORM_DATA_ACTION_KEY,
  type RunDataTransformConfig,
  type RunDataTransformDeps,
} from "@/services/ai/processor/runDataTransform";
import type {
  AiProcessorClient,
  AiProcessRequest,
  AiProcessResult,
} from "@/services/ai/processor/types";

const CUSTOM_SCHEMA: UserDefinedSchema = {
  fields: [
    { name: "full_name", type: "string", required: true },
    { name: "hourly_rate", type: "currency" },
  ],
};

function baseConfig(
  overrides: Partial<RunDataTransformConfig> = {},
): RunDataTransformConfig {
  return {
    input: [{ first: "Ada", last: "Lovelace", rate: "$42.50" }],
    destinationMode: "custom",
    destinationSchema: CUSTOM_SCHEMA,
    outputShape: "rows",
    confidenceThreshold: 0.7,
    onLowConfidence: "flag",
    strictValidation: true,
    maxRows: 100,
    modelQuality: "standard",
    ...overrides,
  };
}

interface Harness {
  deps: RunDataTransformDeps;
  requests: AiProcessRequest[];
  gateCalls: Record<string, unknown>[];
  completed: Record<string, unknown>[];
  failed: Record<string, unknown>[];
}

type GateArm = "ok" | "insufficient" | "frozen";

/** Real pipeline; only the model boundary + gate + ledger are injected. */
function harness(result: AiProcessResult, gate: GateArm = "ok"): Harness {
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
        if (gate === "ok") return { ok: true, charged: 2, used: 2, limit: 100 };
        if (gate === "insufficient") {
          return { ok: false, reason: "insufficient_ai_credits", used: 100, limit: 100 };
        }
        return { ok: false, reason: "account_frozen", used: 0, limit: 0 };
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

  return { requests, gateCalls, completed, failed, deps: { execute } };
}

function ok(payload: unknown): AiProcessResult {
  return { ok: true, payload, modelTag: "test-model", source: "gateway" };
}

function rowsPayload(rows: Record<string, unknown>[], confidence = 0.9) {
  return ok({ rows, overallConfidence: confidence });
}

function run(config: RunDataTransformConfig, deps: RunDataTransformDeps) {
  return runDataTransform(
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

describe("output shapes", () => {
  it("rows: one validated, coerced row per item", async () => {
    const h = harness(
      rowsPayload([
        { full_name: "Ada Lovelace", hourly_rate: "$42.50", [ROW_CONFIDENCE_KEY]: 0.95 },
      ]),
    );
    const output = await run(baseConfig(), h.deps);
    expect(output.rows).toEqual([
      { full_name: "Ada Lovelace", hourly_rate: 42.5, [ROW_CONFIDENCE_KEY]: 0.95 },
    ]);
    expect(output.rowCount).toBe(1);
    expect(output.record).toBeNull();
    expect(output.inputCount).toBe(1);
    expect(output.destination).toBeNull(); // custom mode has no destination step
    expect(output.overallConfidence).toBe(0.9);
  });

  it("record: one validated object keyed by the destination's fields", async () => {
    const h = harness(
      ok({
        record: { full_name: "Ada Lovelace", hourly_rate: "42.50" },
        overallConfidence: 0.8,
      }),
    );
    const output = await run(
      baseConfig({ outputShape: "record", input: { first: "Ada", last: "Lovelace" } }),
      h.deps,
    );
    expect(output.record).toEqual({ full_name: "Ada Lovelace", hourly_rate: 42.5 });
    expect(output.rows).toBeNull();
    expect(output.rowCount).toBeNull();
    expect(output.inputCount).toBe(1);
  });

  it("strips undeclared keys the model invented", async () => {
    const h = harness(
      ok({
        record: { full_name: "Ada", hourly_rate: 1, ssn: "000-00-0000" },
        overallConfidence: 0.9,
      }),
    );
    const output = await run(baseConfig({ outputShape: "record" }), h.deps);
    expect(Object.keys(output.record ?? {})).toEqual(["full_name", "hourly_rate"]);
  });

  it("returns the same key set in both shapes", async () => {
    const rows = await run(
      baseConfig(),
      harness(rowsPayload([{ full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 }])).deps,
    );
    const record = await run(
      baseConfig({ outputShape: "record" }),
      harness(ok({ record: { full_name: "A" }, overallConfidence: 0.9 })).deps,
    );
    expect(Object.keys(rows).sort()).toEqual(Object.keys(record).sort());
    expect(Object.keys(rows).sort()).toEqual([
      "destination",
      "inputCount",
      "lowConfidenceFields",
      "overallConfidence",
      "record",
      "rowCount",
      "rows",
      "warnings",
    ]);
  });
});

describe("destination-action mode", () => {
  it("derives the schema + destinationContext from the registry and reports the gaps", async () => {
    const h = harness(
      ok({
        record: {
          subject: "June invoice",
          body: "See attached.",
          isHtml: false,
          importance: "normal",
        },
        overallConfidence: 0.9,
      }),
    );
    const output = await run(
      baseConfig({
        destinationMode: "action",
        destinationAction: "microsoft-outlook:send_email",
        destinationSchema: undefined,
        outputShape: "record",
        input: { subject: "June invoice", note: "See attached." },
      }),
      h.deps,
    );

    const request = h.requests[0];
    if (request?.task !== "transform_data") throw new Error("wrong task");
    expect(request.schema.fields.map((f) => f.name)).toEqual([
      "subject",
      "body",
      "isHtml",
      "importance",
    ]);
    const context = request.destinationContext as {
      action: { key: string };
      fields: { name: string; options?: unknown[] }[];
    };
    expect(context.action.key).toBe("microsoft-outlook:send_email");
    // Static enums cross to the model — the whole point of decision 11.
    expect(context.fields.find((f) => f.name === "importance")?.options).toBeTruthy();

    expect(output.destination).toBe("microsoft-outlook:send_email");
    expect(output.warnings).toEqual(
      expect.arrayContaining([`${DESTINATION_EXCLUDED_WARNING_PREFIX}to:unsupported_type`]),
    );
  });

  it("never sends destinationContext in custom-schema mode", async () => {
    const h = harness(rowsPayload([{ full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 }]));
    await run(baseConfig(), h.deps);
    expect(h.requests[0]).not.toHaveProperty("destinationContext");
    expect(h.requests[0]).toMatchObject({ schema: CUSTOM_SCHEMA });
  });

  it("refuses an unusable destination BEFORE the gate", async () => {
    const h = harness(rowsPayload([]));
    await expect(
      run(
        baseConfig({
          destinationMode: "action",
          destinationAction: "ghost:create_thing",
          destinationSchema: undefined,
        }),
        h.deps,
      ),
    ).rejects.toBeInstanceOf(DestinationResolutionError);
    expect(h.gateCalls).toHaveLength(0);
    expect(h.requests).toHaveLength(0);
  });
});

describe("input handling", () => {
  it("serializes the resolved value once and sends it as the input payload", async () => {
    const h = harness(rowsPayload([{ full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 }]));
    await run(baseConfig({ input: [{ a: 1 }, { a: 2 }] }), h.deps);
    const request = h.requests[0];
    if (request?.task !== "transform_data") throw new Error("wrong task");
    expect(request.inputJson).toBe('[{"a":1},{"a":2}]');
    expect(request.outputShape).toBe("rows");
    expect(request.limits.maxRows).toBe(100);
  });

  it("refuses an unusable input BEFORE the gate", async () => {
    const h = harness(rowsPayload([]));
    for (const input of [undefined, "not structured data", 42, []]) {
      await expect(run(baseConfig({ input }), h.deps)).rejects.toBeInstanceOf(
        TransformInputError,
      );
    }
    expect(h.gateCalls).toHaveLength(0);
    expect(h.requests).toHaveLength(0);
  });

  it("counts list items for the inputCount output", async () => {
    const h = harness(
      rowsPayload([
        { full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 },
        { full_name: "B", [ROW_CONFIDENCE_KEY]: 0.9 },
      ]),
    );
    const output = await run(
      baseConfig({ input: [{ n: 1 }, { n: 2 }, { n: 3 }] }),
      h.deps,
    );
    expect(output.inputCount).toBe(3);
    expect(output.rowCount).toBe(2);
  });
});

describe("billing + pipeline wiring", () => {
  it("charges the data_transform feature at the fast tier by default", async () => {
    const h = harness(rowsPayload([{ full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 }]));
    await run(baseConfig(), h.deps);
    expect(TRANSFORM_DATA_ACTION_KEY).toBe("ai:transform_data");
    expect(h.gateCalls).toHaveLength(1);
    expect(h.gateCalls[0]).toMatchObject({
      accountId: "acct-1",
      feature: "data_transform",
      plannedTier: "fast",
    });
    expect(h.completed[0]).toMatchObject({
      feature: "data_transform",
      workflowId: "wf-1",
      workflowRunId: "run-1",
      creditsCharged: 2,
    });
  });

  it("maps the higher-quality choice onto the strong tier", async () => {
    const h = harness(rowsPayload([{ full_name: "A", [ROW_CONFIDENCE_KEY]: 0.9 }]));
    await run(baseConfig({ modelQuality: "advanced" }), h.deps);
    expect(h.gateCalls[0]).toMatchObject({ plannedTier: "strong" });
  });

  it("refuses when the processor flag is off, without touching the gate", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    try {
      const h = harness(rowsPayload([]));
      await expect(run(baseConfig(), h.deps)).rejects.toThrow(/not enabled/i);
      expect(h.gateCalls).toHaveLength(0);
    } finally {
      process.env[AI_PROCESSOR_ENV.enabled] = "true";
    }
  });

  it("raises AI_CREDITS_EXHAUSTED (not a generic refusal) when credits run out", async () => {
    const h = harness(rowsPayload([]), "insufficient");
    const promise = run(baseConfig(), h.deps);
    await expect(promise).rejects.toBeInstanceOf(AiCreditsExhaustedError);
    // The engine classifies on `name`; that wire must not drift.
    await expect(promise).rejects.toMatchObject({ name: "AiCreditsExhaustedError" });
    expect(h.requests).toHaveLength(0);
  });

  it("keeps a non-credit refusal as a plain refusal", async () => {
    const h = harness(rowsPayload([]), "frozen");
    const promise = run(baseConfig(), h.deps);
    await expect(promise).rejects.toBeInstanceOf(AiActionRefusedError);
    await expect(promise).rejects.not.toBeInstanceOf(AiCreditsExhaustedError);
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

  it("fails when a required destination field could not be filled", async () => {
    const h = harness(
      ok({
        record: { full_name: null, hourly_rate: 1 },
        overallConfidence: 0.9,
      }),
    );
    const promise = run(baseConfig({ outputShape: "record" }), h.deps);
    await expect(promise).rejects.toBeInstanceOf(ExtractionValidationError);
    await expect(promise).rejects.toThrow(/full_name/);
    expect(h.failed).toHaveLength(1);
  });

  it("passes a missing OPTIONAL value through as null when strictness is off", async () => {
    const h = harness(
      ok({ record: { full_name: "Ada", hourly_rate: null }, overallConfidence: 0.9 }),
    );
    const output = await run(
      baseConfig({ outputShape: "record", strictValidation: false }),
      h.deps,
    );
    expect(output.record).toEqual({ full_name: "Ada", hourly_rate: null });
  });

  it("throws when the reply does not match the requested output shape", async () => {
    const h = harness(ok({ rows: [], overallConfidence: 0.9 }));
    await expect(
      run(baseConfig({ outputShape: "record" }), h.deps),
    ).rejects.toBeInstanceOf(ExtractionValidationError);
  });
});

describe("low-confidence policy", () => {
  const lowRows = rowsPayload(
    [
      { full_name: "A", hourly_rate: 1, [ROW_CONFIDENCE_KEY]: 0.9 },
      { full_name: "B", hourly_rate: 2, [ROW_CONFIDENCE_KEY]: 0.2 },
    ],
    0.5,
  );

  it("flags without failing by default", async () => {
    const output = await run(baseConfig(), harness(lowRows).deps);
    expect(output.lowConfidenceFields).toEqual(["rows[1]"]);
    expect(output.rows).toHaveLength(2);
  });

  it("stops the run when the author opted into failing", async () => {
    await expect(
      run(baseConfig({ onLowConfidence: "fail" }), harness(lowRows).deps),
    ).rejects.toThrow(/not confident enough about rows\[1\]/);
  });

  it("blanks the flagged row's declared columns when asked", async () => {
    const output = await run(
      baseConfig({ onLowConfidence: "blank" }),
      harness(lowRows).deps,
    );
    expect(output.rows?.[0]).toMatchObject({ full_name: "A" });
    expect(output.rows?.[1]).toEqual({
      full_name: null,
      hourly_rate: null,
      [ROW_CONFIDENCE_KEY]: 0.2,
    });
  });

  it("applies to the single-record shape too", async () => {
    const h = harness(
      ok({ record: { full_name: "A", hourly_rate: 1 }, overallConfidence: 0.1 }),
    );
    const output = await run(
      baseConfig({ outputShape: "record", onLowConfidence: "blank" }),
      h.deps,
    );
    expect(output.lowConfidenceFields).toEqual(["record"]);
    expect(output.record).toEqual({ full_name: null, hourly_rate: null });
  });
});
