/**
 * @jest-environment node
 *
 * Tests for services/ai/modelClients/createModelClient.ts (Slice 4.AI-8C).
 *
 * The runtime factory must fail SAFE: missing API key → NOT_CONFIGURED;
 * unsupported provider → CONFIGURATION_ERROR; configured Anthropic + key → the
 * real adapter. Env is read at call time. The API key value is never returned.
 * No live network calls — the one configured-path test mocks global fetch.
 */
import {
  createModelClientForFeature,
  createModelClientForModel,
  createRuntimeModelClient,
  isOpenAiProviderEnabled,
} from "@/services/ai/modelClients/createModelClient";
import { MODELS, type ModelDefinition } from "@/core/ai/models";
import type { AiFeature, ModelGenerateInput } from "@/core/ai/modelTypes";

const input: ModelGenerateInput = {
  feature: "creation",
  messages: [{ role: "user", content: "x" }],
};

const ANTHROPIC_MODEL: ModelDefinition = MODELS.strong;
const OPENAI_MODEL: ModelDefinition = {
  id: "gpt-x",
  provider: "openai",
  tier: "strong",
  maxInputTokens: 100,
  maxOutputTokens: 100,
};

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

function mockOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn" }),
    text: async () => "{}",
  } as unknown as Response;
}

/** OpenAI Responses-API shaped 200 (AI-34A). */
function mockOpenAiOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
      status: "completed",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    text: async () => "{}",
  } as unknown as Response;
}

describe("createModelClientForModel", () => {
  it("returns a NOT_CONFIGURED client for Anthropic with no key", async () => {
    const result = await createModelClientForModel(ANTHROPIC_MODEL, undefined).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
  });

  it("returns a NOT_CONFIGURED client for OpenAI with no key (AI-34A — fail safe, not CONFIGURATION_ERROR)", async () => {
    const noKey = await createModelClientForModel(OPENAI_MODEL, undefined).generateStructuredJson(input);
    expect(noKey.ok).toBe(false);
    if (noKey.ok) return;
    expect(noKey.failureCode).toBe("NOT_CONFIGURED");
  });

  it("returns the real OpenAI adapter for OpenAI + key (reaches a mocked fetch, AI-34A)", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockOpenAiOkResponse());
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await createModelClientForModel(OPENAI_MODEL, "sk-openai-KEY").generateStructuredJson(input);
      expect(result.ok).toBe(true); // real adapter path (not NOT_CONFIGURED / CONFIGURATION_ERROR)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Hit the OpenAI Responses endpoint, not Anthropic.
      expect(fetchSpy.mock.calls[0]![0]).toContain("/v1/responses");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("never echoes the OpenAI API key in a result (AI-34A no-leak)", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockOpenAiOkResponse());
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await createModelClientForModel(OPENAI_MODEL, "sk-openai-LEAKME").generateStructuredJson(input);
      expect(JSON.stringify(result)).not.toContain("sk-openai-LEAKME");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("returns a CONFIGURATION_ERROR client for a provider with no implemented adapter", async () => {
    const unknownProvider = { ...OPENAI_MODEL, provider: "cohere" as unknown as ModelDefinition["provider"] };
    const withKey = await createModelClientForModel(unknownProvider, "some-key").generateStructuredJson(input);
    expect(withKey.ok).toBe(false);
    if (withKey.ok) return;
    expect(withKey.failureCode).toBe("CONFIGURATION_ERROR");
  });

  it("returns the real adapter for Anthropic + key (reaches a mocked fetch)", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockOkResponse());
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await createModelClientForModel(ANTHROPIC_MODEL, "sk-ant-KEY").generateStructuredJson(input);
      expect(result.ok).toBe(true); // real adapter path (not NOT_CONFIGURED)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("never echoes the API key in a result", async () => {
    const fetchSpy = jest.fn().mockResolvedValue(mockOkResponse());
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await createModelClientForModel(ANTHROPIC_MODEL, "sk-ant-LEAKME").generateStructuredJson(input);
      expect(JSON.stringify(result)).not.toContain("sk-ant-LEAKME");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("createRuntimeModelClient — env-driven", () => {
  it("fails NOT_CONFIGURED when the API key env var is absent", async () => {
    const result = await createRuntimeModelClient({ feature: "creation" }).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
    expect(JSON.stringify(result)).not.toMatch(/sk-ant-/);
  });

  it("reads the env at call time and uses the real adapter when the key is present", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-RUNTIME-KEY";
    const fetchSpy = jest.fn().mockResolvedValue(mockOkResponse());
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      const result = await createRuntimeModelClient({ feature: "creation" }).generateStructuredJson(input);
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // The key must not be sent back to callers.
      expect(JSON.stringify(result)).not.toContain("sk-ant-RUNTIME-KEY");
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("does not throw when constructing a client with missing config", () => {
    expect(() => createRuntimeModelClient({ feature: "discovery" as AiFeature })).not.toThrow();
  });
});

describe("createModelClientForFeature", () => {
  it("delegates to the runtime client (NOT_CONFIGURED without a key)", async () => {
    const result = await createModelClientForFeature("creation").generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
  });
});

describe("isOpenAiProviderEnabled (AI-34A flag, default off)", () => {
  const KEY = "ENABLE_OPENAI_PROVIDER";
  let original: string | undefined;
  beforeEach(() => {
    original = process.env[KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("is false when the env var is unset", () => {
    delete process.env[KEY];
    expect(isOpenAiProviderEnabled()).toBe(false);
  });

  it("is true only for the literal 'true'", () => {
    process.env[KEY] = "true";
    expect(isOpenAiProviderEnabled()).toBe(true);
    process.env[KEY] = "1";
    expect(isOpenAiProviderEnabled()).toBe(false);
    process.env[KEY] = "false";
    expect(isOpenAiProviderEnabled()).toBe(false);
  });
});
