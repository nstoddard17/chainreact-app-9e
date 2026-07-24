/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — `ai:transform_data` config contract + handler.
 *
 * The runtime twin of the builder's conditional-field rules, so a config
 * assembled outside the builder (AI planner, template import, API) is held to
 * exactly the same requirements the config panel enforces visually.
 */
import { transformData } from "@/integrations/ai/actions/transformData";
import { TransformDataConfigSchema } from "@/integrations/ai/actions/transformData.schema";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_ROWS,
} from "@/integrations/ai/actions/analyzeDocument.schema";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const runDataTransform = jest.fn();
jest.mock("@/services/ai/processor/runDataTransform", () => ({
  runDataTransform: (...args: unknown[]) => runDataTransform(...args),
}));

const SCHEMA = { fields: [{ name: "full_name", type: "string" as const, required: true }] };

function config(overrides: Record<string, unknown> = {}) {
  return {
    input: [{ a: 1 }],
    destinationMode: "action",
    destinationAction: "microsoft-outlook:send_email",
    outputShape: "rows",
    ...overrides,
  };
}

beforeEach(() => {
  runDataTransform.mockReset();
  runDataTransform.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("config schema", () => {
  it("applies the documented defaults", () => {
    const parsed = TransformDataConfigSchema.parse(config());
    expect(parsed).toMatchObject({
      confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      onLowConfidence: "flag",
      strictValidation: true,
      maxRows: DEFAULT_MAX_ROWS,
      modelQuality: "standard",
    });
  });

  it("rejects undeclared keys", () => {
    expect(
      TransformDataConfigSchema.safeParse(config({ prompt: "raw" })).success,
    ).toBe(false);
  });

  it("accepts any input shape and lets the classifier judge it", () => {
    for (const input of [[{ a: 1 }], { a: 1 }, "text", undefined, 42]) {
      expect(TransformDataConfigSchema.safeParse(config({ input })).success).toBe(true);
    }
  });

  it("requires a destination action in action mode", () => {
    expect(
      TransformDataConfigSchema.safeParse(
        config({ destinationAction: undefined }),
      ).success,
    ).toBe(false);
  });

  it("requires a schema in custom mode, and not a destination action", () => {
    expect(
      TransformDataConfigSchema.safeParse(
        config({ destinationMode: "custom", destinationAction: undefined }),
      ).success,
    ).toBe(false);
    expect(
      TransformDataConfigSchema.safeParse(
        config({
          destinationMode: "custom",
          destinationAction: undefined,
          destinationSchema: SCHEMA,
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects a destination that is not a provider:type key", () => {
    for (const destinationAction of ["send_email", "Outlook:Send", "a:b:c", ""]) {
      expect(
        TransformDataConfigSchema.safeParse(config({ destinationAction })).success,
      ).toBe(false);
    }
  });

  it("bounds the advanced knobs", () => {
    expect(TransformDataConfigSchema.safeParse(config({ maxRows: 501 })).success).toBe(
      false,
    );
    expect(
      TransformDataConfigSchema.safeParse(config({ confidenceThreshold: -1 })).success,
    ).toBe(false);
    expect(
      TransformDataConfigSchema.safeParse(config({ outputShape: "table" })).success,
    ).toBe(false);
    expect(
      TransformDataConfigSchema.safeParse(config({ modelQuality: "best" })).success,
    ).toBe(false);
  });
});

describe("handler", () => {
  const triggerEvent = { provider: "native", eventType: "manual" } as unknown as TriggerEvent;

  it("passes the run scope and parsed config to the orchestrator", async () => {
    const result = await transformData({
      workflowId: "wf-1",
      userId: "user-1",
      accountId: "acct-1",
      runId: "run-1",
      nodeId: "node-1",
      config: config({ instructions: "Use the billing address." }),
      triggerEvent,
      testMode: true,
    });

    expect(runDataTransform).toHaveBeenCalledTimes(1);
    const input = runDataTransform.mock.calls[0][0];
    expect(input).toMatchObject({
      accountId: "acct-1",
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      testMode: true,
    });
    expect(input.config).toMatchObject({
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
      outputShape: "rows",
      instructions: "Use the billing address.",
      strictValidation: true,
      maxRows: DEFAULT_MAX_ROWS,
    });
    expect(result.output).toEqual({ rows: [], rowCount: 0 });
  });

  it("throws on an invalid config instead of calling the orchestrator", async () => {
    await expect(
      transformData({
        workflowId: "wf-1",
        userId: "user-1",
        accountId: "acct-1",
        runId: "run-1",
        nodeId: "node-1",
        config: config({ destinationMode: "custom", destinationAction: undefined }),
        triggerEvent,
      }),
    ).rejects.toThrow();
    expect(runDataTransform).not.toHaveBeenCalled();
  });
});
