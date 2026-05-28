/**
 * @jest-environment node
 *
 * Slice 4.AI-34C — OpenAI fast-tier model classifier.
 *
 * Pins: gating (3 flags), the tiny no-secrets prompt shape, the forced tool
 * targeting the fast tier, parse + unknown-id filtering, and the fail-safe
 * fallback (any failure → null result + a typed outcome, never a throw). The
 * model client is INJECTED so no test touches the network.
 */
import {
  buildModelClassifierMessages,
  CLASSIFY_INTENT_TOOL,
  isModelNarrowingClassifierEnabled,
  parseModelClassifierResponse,
  runModelNarrowingClassifier,
} from "@/services/ai/planner/modelNarrowingClassifier";
import { getModelForFeature, getModelForTier } from "@/core/ai/models";
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";
import type { NarrowProvidersInput } from "@/services/ai/planner/narrowProvidersForPlan";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function prov(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [],
    triggers: [],
  };
}

const catalog: ProviderCatalogView = {
  providers: [prov("slack"), prov("gmail"), prov("microsoft-outlook"), prov("stripe"), prov("native")],
};

function input(overrides: Partial<NarrowProvidersInput> = {}): NarrowProvidersInput {
  return { userRequest: "Send a Slack message when I get an email", catalog, connectedIntegrations: [], ...overrides };
}

const M = "ENABLE_AI_MODEL_NARROWING_CLASSIFIER";
const O = "ENABLE_OPENAI_PROVIDER";
const K = "OPENAI_API_KEY";

function snapshotEnv() {
  return { m: process.env[M], o: process.env[O], k: process.env[K] };
}
function restoreEnv(s: { m?: string; o?: string; k?: string }) {
  for (const [key, val] of [[M, s.m], [O, s.o], [K, s.k]] as const) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

function mockClient(result: ModelResult): { client: ModelClient; calls: ModelGenerateInput[] } {
  const calls: ModelGenerateInput[] = [];
  return {
    calls,
    client: {
      async generateStructuredJson(req: ModelGenerateInput): Promise<ModelResult> {
        calls.push(req);
        return result;
      },
    },
  };
}

function okResult(args: unknown): ModelResult {
  return {
    ok: true,
    modelId: "gpt-4.1-mini",
    feature: "discovery",
    text: JSON.stringify(args),
    finishReason: "stop",
    usage: { inputTokens: 50, outputTokens: 10 },
    latencyMs: 5,
  };
}

let saved: ReturnType<typeof snapshotEnv>;
beforeEach(() => {
  saved = snapshotEnv();
});
afterEach(() => restoreEnv(saved));

describe("isModelNarrowingClassifierEnabled", () => {
  it("only the literal 'true' enables it", () => {
    process.env[M] = "true";
    expect(isModelNarrowingClassifierEnabled()).toBe(true);
    process.env[M] = "1";
    expect(isModelNarrowingClassifierEnabled()).toBe(false);
    delete process.env[M];
    expect(isModelNarrowingClassifierEnabled()).toBe(false);
  });
});

describe("buildModelClassifierMessages — tiny, no-secrets prompt", () => {
  it("includes the request + provider ids + connected/canvas ids, NOT the full catalog or config fields", () => {
    const msgs = buildModelClassifierMessages(
      input({
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: null, accountScope: null, scopeCount: 0 },
        ],
        currentGraph: { nodes: [{ id: "n1", kind: "trigger", provider: "gmail", type: "new_email" }], edges: [] },
      }),
    );
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("Send a Slack message when I get an email");
    expect(joined).toContain("slack, gmail, microsoft-outlook, stripe, native");
    expect(joined).toContain("Connected provider ids: slack");
    expect(joined).toContain("gmail:new_email");
    // No catalog internals leak into the tiny prompt.
    expect(joined).not.toContain("config fields");
    expect(joined).not.toContain("outputs:");
  });
});

describe("CLASSIFY_INTENT_TOOL", () => {
  it("is a function tool returning the classifier shape", () => {
    expect(CLASSIFY_INTENT_TOOL.name).toBe("classify_workflow_intent");
    const props = (CLASSIFY_INTENT_TOOL.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["intentType", "confidence", "candidateProviders", "broadOrAmbiguous"]),
    );
  });
});

describe("parseModelClassifierResponse", () => {
  const ids = new Set(["slack", "gmail", "microsoft-outlook", "stripe", "native"]);

  it("parses a valid payload and keeps only known provider ids", () => {
    const r = parseModelClassifierResponse(
      JSON.stringify({
        intentType: "create",
        confidence: "high",
        candidateProviders: ["slack", "gmail", "totally-not-real"],
        triggerHints: ["gmail:new_email"],
        actionHints: ["slack:send_channel_message"],
        broadOrAmbiguous: false,
      }),
      ids,
    );
    expect(r).not.toBeNull();
    expect(r!.candidateProviders).toEqual(["slack", "gmail"]); // unknown id dropped
    expect(r!.source).toBe("model");
    expect(r!.modelTier).toBe("fast");
    expect(r!.intentType).toBe("create");
    expect(r!.confidence).toBe("high");
  });

  it("clamps invalid enums to safe defaults", () => {
    const r = parseModelClassifierResponse(
      JSON.stringify({ intentType: "garbage", confidence: "spicy", candidateProviders: [], broadOrAmbiguous: "yes" }),
      ids,
    );
    expect(r!.intentType).toBe("unknown");
    expect(r!.confidence).toBe("low");
    expect(r!.broadOrAmbiguous).toBe(false); // only literal true counts
  });

  it("returns null for non-JSON / non-object", () => {
    expect(parseModelClassifierResponse("not json", ids)).toBeNull();
    expect(parseModelClassifierResponse("[1,2,3]", ids)).toBeNull();
  });
});

describe("runModelNarrowingClassifier — gating + fail-safe", () => {
  it("flag off → model_disabled (no client call)", async () => {
    delete process.env[M];
    const { client, calls } = mockClient(okResult({}));
    const out = await runModelNarrowingClassifier(input(), { modelClient: client });
    expect(out).toEqual({ result: null, outcome: "model_disabled" });
    expect(calls).toHaveLength(0);
  });

  it("ENABLE_OPENAI_PROVIDER off → openai_not_configured", async () => {
    process.env[M] = "true";
    delete process.env[O];
    const { client, calls } = mockClient(okResult({}));
    const out = await runModelNarrowingClassifier(input(), { modelClient: client });
    expect(out.outcome).toBe("openai_not_configured");
    expect(out.result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("missing OPENAI_API_KEY (and no injected client) → openai_not_configured (does NOT throw)", async () => {
    process.env[M] = "true";
    process.env[O] = "true";
    delete process.env[K];
    const out = await runModelNarrowingClassifier(input());
    expect(out.outcome).toBe("openai_not_configured");
    expect(out.result).toBeNull();
  });

  it("success → model_succeeded, fast-tier forced-tool request, candidates filtered", async () => {
    process.env[M] = "true";
    process.env[O] = "true";
    const { client, calls } = mockClient(
      okResult({ intentType: "create", confidence: "high", candidateProviders: ["slack", "gmail"], broadOrAmbiguous: false }),
    );
    const out = await runModelNarrowingClassifier(input(), { modelClient: client });
    expect(out.outcome).toBe("model_succeeded");
    expect(out.result?.candidateProviders).toEqual(["slack", "gmail"]);
    expect(out.result?.source).toBe("model");
    // The classifier targets the FAST tier with the forced classify tool.
    expect(calls[0]!.tier).toBe("fast");
    expect(calls[0]!.responseTool?.name).toBe("classify_workflow_intent");
    // Slice 4.AI-35D — telemetry captured for the recorder. Tokens/latency
    // from the model result; raw vs valid candidate counts; confidence enum.
    expect(out.telemetry).toEqual({
      modelName: "gpt-4.1-mini",
      modelProvider: "openai",
      responded: true,
      inputTokens: 50,
      outputTokens: 10,
      latencyMs: 5,
      outcome: "model_succeeded",
      confidence: "high",
      candidateProviderCount: 2,
      validProviderCount: 2,
    });
  });

  it("model failure → model_failed (plan proceeds on deterministic)", async () => {
    process.env[M] = "true";
    process.env[O] = "true";
    const { client } = mockClient({
      ok: false,
      modelId: "gpt-4.1-mini",
      feature: "discovery",
      failureCode: "RATE_LIMITED",
      message: "slow down",
      retryable: true,
    });
    const out = await runModelNarrowingClassifier(input(), { modelClient: client });
    expect(out).toMatchObject({ result: null, outcome: "model_failed" });
    // Slice 4.AI-35D — a failed call still records telemetry (responded:false,
    // no tokens) so the recorder can emit an ai_model_call_failed row.
    expect(out.telemetry).toEqual({
      modelName: "gpt-4.1-mini",
      modelProvider: "openai",
      responded: false,
      outcome: "model_failed",
    });
  });

  it("unparseable model text → model_failed (telemetry still has tokens)", async () => {
    process.env[M] = "true";
    process.env[O] = "true";
    const { client } = mockClient({
      ok: true,
      modelId: "gpt-4.1-mini",
      feature: "discovery",
      text: "<<<not json>>>",
      finishReason: "stop",
      usage: { inputTokens: 42, outputTokens: 7 },
      latencyMs: 1,
    });
    const out = await runModelNarrowingClassifier(input(), { modelClient: client });
    expect(out).toMatchObject({ result: null, outcome: "model_failed" });
    // The model RESPONDED (and billed us) but the text was unparseable — we
    // still attribute the tokens so the cost isn't invisible.
    expect(out.telemetry).toMatchObject({
      modelName: "gpt-4.1-mini",
      modelProvider: "openai",
      responded: true,
      inputTokens: 42,
      outputTokens: 7,
      latencyMs: 1,
      outcome: "model_failed",
    });
  });
});

describe("planner stays on Anthropic/Sonnet (the classifier never moves it)", () => {
  it("the default planner tier/feature still resolves to an Anthropic model", () => {
    expect(getModelForFeature("creation").provider).toBe("anthropic");
    expect(getModelForTier("strong").provider).toBe("anthropic");
  });
});
