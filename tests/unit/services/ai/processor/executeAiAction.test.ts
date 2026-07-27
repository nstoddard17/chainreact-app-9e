/** @jest-environment node */
/**
 * The standard AI action pipeline. Since AI-PROVIDER-3 (CS-3) all three
 * registered capabilities are really priced, so these tests exercise the REAL
 * credit policy and registry — only the external/injected seams (credit gate,
 * processor client, ledger) are stubbed.
 */
import * as aiCreditPolicy from "@/core/billing/aiCreditPolicy";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import {
  executeAiAction,
  type AiActionLedger,
  type ExecuteAiActionDeps,
  type ExecuteAiActionInput,
} from "@/services/ai/processor/executeAiAction";
import { resolveModelRoute } from "@/services/ai/processor/resolveModelRoute";
import type {
  AiProcessorClient,
  AiProcessRequest,
  AiProcessResult,
  ModelRoute,
} from "@/services/ai/processor/types";

const REQUEST: AiProcessRequest = {
  task: "analyze_document",
  mode: "summarize",
  document: {
    name: "a.pdf",
    mimeType: "application/pdf",
    truncated: false,
    segments: [{ label: "Page 1", text: "hello" }],
  },
  limits: { maxRows: 100, maxOutputTokens: 1000 },
};

const GOOD_PAYLOAD = { summary: "s", keyPoints: [], overallConfidence: 0.8 };

function baseInput(
  overrides: Partial<ExecuteAiActionInput<unknown>> = {},
): ExecuteAiActionInput<unknown> {
  return {
    actionKey: "ai:analyze_document",
    accountId: "acct-1",
    userId: "user-1",
    request: REQUEST,
    validate: (payload) => ({ ok: true, value: payload }),
    ...overrides,
  };
}

interface Trace {
  order: string[];
  gateCalls: Array<Record<string, unknown>>;
  clientFeatures: string[];
  ledger: AiActionLedger & { completed: unknown[]; failed: unknown[] };
  deps: ExecuteAiActionDeps;
}

function makeDeps(processResult: AiProcessResult, gateOutcome?: unknown): Trace {
  const order: string[] = [];
  const gateCalls: Array<Record<string, unknown>> = [];
  const clientFeatures: string[] = [];
  const completed: unknown[] = [];
  const failed: unknown[] = [];
  const ledger = {
    completed,
    failed,
    async recordCompleted(input: unknown) {
      order.push("ledger_completed");
      completed.push(input);
    },
    async recordFailed(input: unknown) {
      order.push("ledger_failed");
      failed.push(input);
    },
  };
  const client: AiProcessorClient = {
    async process() {
      order.push("client");
      return processResult;
    },
  };
  const deps: ExecuteAiActionDeps = {
    gate: (async (input: Record<string, unknown>) => {
      order.push("gate");
      gateCalls.push(input);
      return (gateOutcome ?? { ok: true, skipped: true, reason: "enforcement_disabled" }) as never;
    }) as never,
    resolveRoute: (input) => {
      order.push("route");
      return resolveModelRoute(input);
    },
    createClient: (route: ModelRoute, feature: string) => {
      order.push(`create_client:${route.provider}`);
      clientFeatures.push(feature);
      return client;
    },
    ledger,
  };
  return { order, gateCalls, clientFeatures, ledger, deps };
}

const OK_RESULT: AiProcessResult = {
  ok: true,
  payload: GOOD_PAYLOAD,
  usage: { inputTokens: 100, outputTokens: 10 },
  modelTag: "hermes-doc-v1",
  source: "gateway",
};

describe("executeAiAction pipeline", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = Object.values(AI_PROCESSOR_ENV);
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[AI_PROCESSOR_ENV.gatewayToken] = "tok";
    jest.restoreAllMocks();
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    jest.restoreAllMocks();
  });

  // ─── Preflight ordering (fail-closed before any spend) ────────────────────

  it("unknown action key is refused BEFORE gate and client", async () => {
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput({ actionKey: "ai:nope" }), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "unknown_action" }),
    );
    expect(order).toEqual([]);
  });

  it("flag off → disabled refusal before gate/client", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "disabled" }),
    );
    expect(order).toEqual([]);
  });

  it("schema_suggestion rejects the strong tier (registry allows fast only)", async () => {
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(
      baseInput({ actionKey: "ai:suggest_schema", requestedTier: "strong" }),
      deps,
    );
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "tier_unsupported" }),
    );
    expect(order).toEqual([]);
  });

  it("a REGRESSION that unprices a registered feature fails closed (never the 5-credit fallback)", async () => {
    jest.spyOn(aiCreditPolicy, "computeAiCreditCharge").mockReturnValue({
      credits: 5,
      policyVersion: "regressed",
      mapped: false,
      escalated: false,
    });
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "feature_not_priced" }),
    );
    expect(order).toEqual([]); // no gate, no route, no client, no ledger
  });

  // ─── Credit gating ────────────────────────────────────────────────────────

  it("passes the REAL feature and computed credit amount to the gate", async () => {
    const { deps, gateCalls } = makeDeps(OK_RESULT);
    await executeAiAction(baseInput(), deps);
    expect(gateCalls).toHaveLength(1);
    expect(gateCalls[0]).toEqual(
      expect.objectContaining({
        accountId: "acct-1",
        feature: "document_analysis",
        plannedTier: "fast",
      }),
    );
  });

  it("document_analysis strong tier prices at 20 credits; data_transform fast at 5 (ai-credits-v2)", async () => {
    const analyze = makeDeps(OK_RESULT, { ok: true, charged: 20, used: 20, limit: 100 });
    const analyzeOutcome = await executeAiAction(
      baseInput({ requestedTier: "strong" }),
      analyze.deps,
    );
    expect(analyzeOutcome).toEqual(
      expect.objectContaining({
        status: "success",
        feature: "document_analysis",
        tier: "strong",
        estimatedCredits: 20,
        creditsCharged: 20,
      }),
    );

    const transform = makeDeps(OK_RESULT, { ok: true, charged: 5, used: 5, limit: 100 });
    const transformOutcome = await executeAiAction(
      baseInput({
        actionKey: "ai:transform_data",
        request: {
          task: "transform_data",
          inputJson: "[]",
          outputShape: "rows",
          schema: { fields: [{ name: "a", type: "string" }] },
          limits: { maxRows: 10, maxOutputTokens: 500 },
        },
        validate: () => ({ ok: true, value: null }),
      }),
      transform.deps,
    );
    expect(transformOutcome).toEqual(
      expect.objectContaining({
        status: "success",
        feature: "data_transform",
        estimatedCredits: 5,
        creditsCharged: 5,
      }),
    );
  });

  it("gate refusal never reaches the client", async () => {
    const { deps, order } = makeDeps(OK_RESULT, {
      ok: false,
      reason: "insufficient_ai_credits",
      used: 10,
      limit: 10,
    });
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "preflight_refused",
        reason: "credits_refused",
        message: "Not enough AI credits for this step.",
      }),
    );
    expect(order).toEqual(["gate"]);
  });

  it("test mode reaches the gate and stays uncharged (existing skip policy)", async () => {
    const { deps, gateCalls } = makeDeps(OK_RESULT, {
      ok: true,
      skipped: true,
      reason: "test_mode",
    });
    const outcome = await executeAiAction(baseInput({ testMode: true }), deps);
    expect(gateCalls[0]).toEqual(expect.objectContaining({ testMode: true }));
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "success",
        creditsCharged: 0, // uncharged...
        estimatedCredits: 10, // ...but the policy price is still reported (doc analysis fast, v2)
      }),
    );
  });

  // ─── Routing, execution, validation ───────────────────────────────────────

  it("happy path ordering: gate → route → client → ledger, exactly once each", async () => {
    const { deps, order, ledger, clientFeatures } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "success",
        value: GOOD_PAYLOAD,
        modelTag: "hermes-doc-v1",
        source: "gateway",
        tier: "fast",
        feature: "document_analysis",
      }),
    );
    expect(order).toEqual(["gate", "route", "create_client:gateway", "client", "ledger_completed"]);
    // The client factory receives the REAL registry feature (no data_qa placeholder).
    expect(clientFeatures).toEqual(["document_analysis"]);
    expect(ledger.completed).toHaveLength(1);
    expect(ledger.failed).toHaveLength(0);
  });

  it("provider failure → provider_failed + ledger recordFailed with safe metadata", async () => {
    const { deps, ledger } = makeDeps({
      ok: false,
      code: "TIMEOUT",
      retryable: true,
      message: "The AI service did not respond in time.",
    });
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "provider_failed", code: "TIMEOUT", retryable: true }),
    );
    expect(ledger.failed).toHaveLength(1);
    const failure = ledger.failed[0] as { feature: string; metadata: Record<string, unknown> };
    expect(failure.feature).toBe("document_analysis");
    expect(failure.metadata).toEqual(
      expect.objectContaining({ task: "analyze_document", failureCode: "TIMEOUT" }),
    );
    expect(JSON.stringify(failure)).not.toContain("hello"); // no document text
  });

  it("caller validation failure → invalid_output; ledger has counts, never values", async () => {
    const { deps, ledger } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(
      baseInput({ validate: () => ({ ok: false, issues: ["total_amount", "hire_date"] }) }),
      deps,
    );
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "invalid_output",
        issues: ["total_amount", "hire_date"],
      }),
    );
    const serialized = JSON.stringify(ledger.failed[0]);
    expect(serialized).toContain("validationIssueCount");
    expect(serialized).not.toContain("summary");
    expect(serialized).not.toContain("hello");
  });

  // ─── Ledger contract ──────────────────────────────────────────────────────

  it("ledger success carries the real feature, credits, and safe attribution only", async () => {
    const { deps, ledger } = makeDeps(OK_RESULT, { ok: true, charged: 10, used: 10, limit: 100 });
    await executeAiAction(baseInput({ workflowId: "wf-1", workflowRunId: "run-1" }), deps);
    const entry = ledger.completed[0] as Record<string, unknown>;
    expect(entry).toEqual(
      expect.objectContaining({
        accountId: "acct-1",
        userId: "user-1",
        feature: "document_analysis",
        workflowId: "wf-1",
        workflowRunId: "run-1",
        modelTag: "hermes-doc-v1",
        source: "gateway",
        creditsCharged: 10,
        usage: { inputTokens: 100, outputTokens: 10 },
      }),
    );
    const meta = entry.metadata as Record<string, unknown>;
    expect(meta).toEqual(
      expect.objectContaining({
        task: "analyze_document",
        mode: "summarize",
        tier: "fast",
        estimatedCredits: 10,
        usageSource: "gateway_reported",
      }),
    );
    expect(JSON.stringify(meta)).not.toMatch(/hello|summary|keyPoints/);
  });

  it("ledger failure is fail-open: a throwing ledger never changes the outcome", async () => {
    const throwing = {
      async recordCompleted() {
        throw new Error("ledger down");
      },
      async recordFailed() {
        throw new Error("ledger down");
      },
    };
    const { deps } = makeDeps(OK_RESULT);
    const success = await executeAiAction(baseInput(), { ...deps, ledger: throwing });
    expect(success).toEqual(expect.objectContaining({ status: "success" }));

    const { deps: failingDeps } = makeDeps({
      ok: false,
      code: "PROVIDER_ERROR",
      retryable: true,
      message: "boom-safe",
    });
    const failure = await executeAiAction(baseInput(), { ...failingDeps, ledger: throwing });
    expect(failure).toEqual(
      expect.objectContaining({ status: "provider_failed", code: "PROVIDER_ERROR" }),
    );
  });
});
