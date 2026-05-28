/**
 * @jest-environment node
 *
 * Slice 4.AI-36 — React Agent planner provider routing.
 *
 * Pins: OpenAI is the planner provider when enabled+configured; Anthropic is
 * dormant (emergency flag ONLY) and is NEVER a silent fallback; missing config
 * → NOT_CONFIGURED (model unavailable), never Anthropic. The OpenAI path hits
 * /v1/responses; the NOT_CONFIGURED paths make no network call at all.
 */
import {
  createPlannerModelClient,
  isAnthropicPlannerFallbackEnabled,
  isOpenAiPlannerEnabled,
} from "@/services/ai/modelClients/createModelClient";
import { getModelById } from "@/core/ai/models";

const FLAGS = [
  "ENABLE_OPENAI_PLANNER",
  "ENABLE_OPENAI_PROVIDER",
  "ENABLE_ANTHROPIC_PLANNER_FALLBACK",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));
  for (const k of FLAGS) delete process.env[k];
});
afterEach(() => {
  for (const k of FLAGS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

const PLAN_INPUT = { feature: "creation" as const };

function withFetch<T>(impl: jest.Mock, fn: () => Promise<T>): Promise<T> {
  const original = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch?: unknown }).fetch = impl;
  return fn().finally(() => {
    (globalThis as { fetch?: unknown }).fetch = original;
  });
}

const okResponsesBody = {
  ok: true,
  status: 200,
  json: async () => ({
    output: [{ type: "function_call", name: "t", arguments: "{}", call_id: "c1" }],
    status: "completed",
    usage: { input_tokens: 1, output_tokens: 1 },
  }),
  text: async () => "{}",
};

describe("flag readers", () => {
  it("only the literal 'true' enables each flag", () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    expect(isOpenAiPlannerEnabled()).toBe(true);
    process.env.ENABLE_OPENAI_PLANNER = "1";
    expect(isOpenAiPlannerEnabled()).toBe(false);
    process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK = "true";
    expect(isAnthropicPlannerFallbackEnabled()).toBe(true);
  });
});

describe("createPlannerModelClient — OpenAI is the planner provider", () => {
  it("routes to OpenAI gpt-4.1-mini (fast) when planner + provider enabled + key", () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-TEST";
    const r = createPlannerModelClient(PLAN_INPUT);
    expect(r.provider).toBe("openai");
    expect(r.modelId).toBe("gpt-4.1-mini");
    expect(r.tier).toBe("fast");
    expect(getModelById(r.modelId)?.provider).toBe("openai"); // telemetry maps to openai
  });

  it("the OpenAI planner client calls /v1/responses (NOT Anthropic /v1/messages)", async () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-TEST";
    const fetchSpy = jest.fn().mockResolvedValue(okResponsesBody as unknown as Response);
    const r = createPlannerModelClient(PLAN_INPUT);
    await withFetch(fetchSpy, () =>
      r.client.generateStructuredJson({
        feature: "creation",
        tier: "fast",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/responses");
    expect(fetchSpy.mock.calls[0]![0]).not.toContain("/v1/messages");
  });

  it("OpenAI planner enabled but NO key → NOT_CONFIGURED, no network call, NOT Anthropic", async () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    const fetchSpy = jest.fn();
    const r = createPlannerModelClient(PLAN_INPUT);
    expect(r.provider).toBe("openai");
    const result = await withFetch(fetchSpy, () =>
      r.client.generateStructuredJson({ feature: "creation", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("createPlannerModelClient — Anthropic is dormant", () => {
  it("does NOT route to Anthropic when only the keys are present (no emergency flag)", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-TEST";
    const r = createPlannerModelClient(PLAN_INPUT);
    expect(r.provider).toBe("none"); // model unavailable — NOT anthropic
  });

  it("routes to Anthropic ONLY when the explicit emergency flag is set", () => {
    process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK = "true";
    process.env.ANTHROPIC_API_KEY = "sk-ant-TEST";
    const r = createPlannerModelClient(PLAN_INPUT);
    expect(r.provider).toBe("anthropic");
    expect(getModelById(r.modelId)?.provider).toBe("anthropic");
  });

  it("OpenAI planner WINS over the emergency flag when both are set", () => {
    process.env.ENABLE_OPENAI_PLANNER = "true";
    process.env.ENABLE_OPENAI_PROVIDER = "true";
    process.env.OPENAI_API_KEY = "sk-openai-TEST";
    process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK = "true";
    expect(createPlannerModelClient(PLAN_INPUT).provider).toBe("openai");
  });

  it("nothing enabled → NOT_CONFIGURED (model unavailable), no network call", async () => {
    const fetchSpy = jest.fn();
    const r = createPlannerModelClient(PLAN_INPUT);
    expect(r.provider).toBe("none");
    const result = await withFetch(fetchSpy, () =>
      r.client.generateStructuredJson({ feature: "creation", messages: [{ role: "user", content: "hi" }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
