/** @jest-environment node */
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
  AiProcessResult,
  ModelRoute,
} from "@/services/ai/processor/types";

/**
 * Pipeline behavior tests. The registry's real features are unpriced until
 * CS-3, so pipeline-order tests inject a gate/client/ledger AND run against
 * `ai:analyze_document` with the pricing step exercised both ways:
 *   - the real policy → feature_not_priced refusal (the honest pre-CS-3 state)
 *   - a PRICED simulation via the injected gate is NOT possible (pricing is
 *     not injectable by design), so ordering tests assert the refusal happens
 *     BEFORE the gate/model call — which is exactly the fail-closed contract.
 * Full success-path tests will flip on in CS-3 when the features are priced;
 * until then the success path is proven by driving the pipeline with the
 * pricing check bypassed at its seam: a registry key whose feature IS priced
 * does not exist yet, so we simulate CS-3 by temporarily pricing via the
 * policy's own extension point — not available — hence the success path is
 * tested through `validate`/client/ledger behavior using `feature_not_priced`
 * disabled? NO — instead, the tests below monkey-patch NOTHING: they assert
 * pre-CS-3 refusal, and the post-gate stages are tested by injecting deps and
 * a PRICED feature through a test-only registry seam is deliberately absent.
 *
 * Practical resolution: the post-pricing stages (gate ordering, client call,
 * validation, ledger) are exercised by mocking `computeAiCreditCharge`'s
 * INPUT — impossible — so instead we jest.mock the policy module for the
 * pipeline-order describe block. That keeps the business rule under test
 * (ordering / fail-closed), not the mocked pricing itself.
 */
jest.mock("@/core/billing/aiCreditPolicy", () => {
  const actual = jest.requireActual("@/core/billing/aiCreditPolicy");
  return {
    ...actual,
    computeAiCreditCharge: jest.fn(actual.computeAiCreditCharge),
  };
});

import { computeAiCreditCharge } from "@/core/billing/aiCreditPolicy";
const chargeMock = computeAiCreditCharge as jest.MockedFunction<typeof computeAiCreditCharge>;

const REQUEST = {
  task: "analyze_document" as const,
  mode: "summarize" as const,
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
  ledger: AiActionLedger & { completed: unknown[]; failed: unknown[] };
  deps: ExecuteAiActionDeps;
  clientResults: AiProcessResult[];
}

function makeDeps(processResult: AiProcessResult, gateOutcome?: unknown): Trace {
  const order: string[] = [];
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
    gate: (async (input: unknown) => {
      order.push("gate");
      void input;
      return (gateOutcome ?? { ok: true, skipped: true, reason: "enforcement_disabled" }) as never;
    }) as never,
    resolveRoute: (input) => {
      order.push("route");
      return resolveModelRoute(input);
    },
    createClient: (route: ModelRoute) => {
      order.push(`create_client:${route.provider}`);
      return client;
    },
    ledger,
  };
  return { order, ledger, deps, clientResults: [processResult] };
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
    chargeMock.mockClear();
    // Default: simulate CS-3 pricing so post-pricing stages are testable.
    chargeMock.mockReturnValue({
      credits: 3,
      policyVersion: "test",
      mapped: true,
      escalated: false,
    });
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("unknown action key is refused BEFORE gate and client", async () => {
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput({ actionKey: "ai:nope" }), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "unknown_action" }),
    );
    expect(order).toEqual([]);
    expect(chargeMock).not.toHaveBeenCalled();
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

  it("unsupported tier is refused before pricing/gate", async () => {
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(
      baseInput({ actionKey: "ai:suggest_schema", requestedTier: "strong" }),
      deps,
    );
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "tier_unsupported" }),
    );
    expect(order).toEqual([]);
    expect(chargeMock).not.toHaveBeenCalled();
  });

  it("UNPRICED feature (the real pre-CS-3 policy) is refused before the gate — never the 5-credit fallback", async () => {
    const actual = jest.requireActual("@/core/billing/aiCreditPolicy");
    chargeMock.mockImplementation(actual.computeAiCreditCharge);
    const { deps, order } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "preflight_refused", reason: "feature_not_priced" }),
    );
    expect(order).toEqual([]); // no gate, no route, no client, no ledger
  });

  it("gate refusal never reaches the client; outcome carries the gate detail", async () => {
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

  it("happy path: ordering is gate → route → client → ledger, exactly once each", async () => {
    const { deps, order, ledger } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput(), deps);
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "success",
        value: GOOD_PAYLOAD,
        modelTag: "hermes-doc-v1",
        source: "gateway",
        tier: "fast",
        feature: "document_analysis",
        creditsCharged: 0, // gate skipped (enforcement_disabled) → nothing deducted
      }),
    );
    expect(order).toEqual(["gate", "route", "create_client:gateway", "client", "ledger_completed"]);
    expect(ledger.completed).toHaveLength(1);
    expect(ledger.failed).toHaveLength(0);
  });

  it("charged gate outcome propagates creditsCharged", async () => {
    const { deps } = makeDeps(OK_RESULT, { ok: true, charged: 6, used: 6, limit: 100 });
    const outcome = await executeAiAction(baseInput({ requestedTier: "strong" }), deps);
    expect(outcome).toEqual(
      expect.objectContaining({ status: "success", creditsCharged: 6, tier: "strong" }),
    );
  });

  it("testMode is passed through to the gate (existing skip policy)", async () => {
    const gateCalls: unknown[] = [];
    const { deps } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(baseInput({ testMode: true }), {
      ...deps,
      gate: (async (input: unknown) => {
        gateCalls.push(input);
        return { ok: true, skipped: true, reason: "test_mode" };
      }) as never,
    });
    expect(outcome).toEqual(expect.objectContaining({ status: "success", creditsCharged: 0 }));
    expect(gateCalls[0]).toEqual(expect.objectContaining({ testMode: true }));
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
    const meta = (ledger.failed[0] as { metadata: Record<string, unknown> }).metadata;
    expect(meta).toEqual(
      expect.objectContaining({ task: "analyze_document", failureCode: "TIMEOUT" }),
    );
    expect(JSON.stringify(ledger.failed[0])).not.toContain("hello"); // no document text
  });

  it("caller validation failure → invalid_output; ledger metadata has counts, never values", async () => {
    const { deps, ledger } = makeDeps(OK_RESULT);
    const outcome = await executeAiAction(
      baseInput({
        validate: () => ({ ok: false, issues: ["total_amount", "hire_date"] }),
      }),
      deps,
    );
    expect(outcome).toEqual(
      expect.objectContaining({
        status: "invalid_output",
        issues: ["total_amount", "hire_date"],
      }),
    );
    expect(ledger.failed).toHaveLength(1);
    const serialized = JSON.stringify(ledger.failed[0]);
    expect(serialized).toContain("validationIssueCount");
    expect(serialized).not.toContain("summary"); // no output values in ledger
    expect(serialized).not.toContain("hello");
  });

  it("ledger success metadata carries only safe attribution", async () => {
    const { deps, ledger } = makeDeps(OK_RESULT);
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
        creditsCharged: 0,
        usage: { inputTokens: 100, outputTokens: 10 },
      }),
    );
    const meta = entry.metadata as Record<string, unknown>;
    expect(meta.usageSource).toBe("gateway_reported");
    expect(JSON.stringify(meta)).not.toMatch(/hello|summary|keyPoints/);
  });

  it("ledger failure is fail-open: a throwing ledger never changes the outcome", async () => {
    const { deps } = makeDeps(OK_RESULT);
    const throwing = {
      async recordCompleted() {
        throw new Error("ledger down");
      },
      async recordFailed() {
        throw new Error("ledger down");
      },
    };
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
