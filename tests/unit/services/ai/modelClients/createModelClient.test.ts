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

describe("createModelClientForModel", () => {
  it("returns a NOT_CONFIGURED client for Anthropic with no key", async () => {
    const result = await createModelClientForModel(ANTHROPIC_MODEL, undefined).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
  });

  it("returns a CONFIGURATION_ERROR client for an unsupported provider (with or without key)", async () => {
    const withKey = await createModelClientForModel(OPENAI_MODEL, "some-key").generateStructuredJson(input);
    const noKey = await createModelClientForModel(OPENAI_MODEL, undefined).generateStructuredJson(input);
    expect(withKey.ok).toBe(false);
    expect(noKey.ok).toBe(false);
    if (withKey.ok || noKey.ok) return;
    expect(withKey.failureCode).toBe("CONFIGURATION_ERROR");
    expect(noKey.failureCode).toBe("CONFIGURATION_ERROR");
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
