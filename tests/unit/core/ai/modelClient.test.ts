/**
 * @jest-environment node
 *
 * Tests for core/ai/modelClient.ts (Slice 4.AI-8A).
 *
 * Both clients are in-memory — no network, no timers. These prove the mock
 * returns a structured result + records calls, and the NOT_CONFIGURED adapter
 * fails safely (and never attempts a live call).
 */
import {
  createMockModelClient,
  createNotConfiguredModelClient,
} from "@/core/ai/modelClient";
import { MODELS } from "@/core/ai/models";
import type { ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";

const baseInput: ModelGenerateInput = {
  feature: "creation",
  messages: [{ role: "user", content: "make a workflow" }],
};

describe("createNotConfiguredModelClient", () => {
  it("always resolves a NOT_CONFIGURED failure with a real model id", async () => {
    const client = createNotConfiguredModelClient();
    const result = await client.generateStructuredJson(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NOT_CONFIGURED");
    expect(result.feature).toBe("creation");
    expect(result.modelId).toBe(MODELS.strong.id); // creation → strong
    expect(result.message).toMatch(/configured/i);
  });

  it("never returns a success and never throws", async () => {
    const client = createNotConfiguredModelClient();
    await expect(
      client.generateStructuredJson({ ...baseInput, tier: "fast" }),
    ).resolves.toMatchObject({ ok: false, failureCode: "NOT_CONFIGURED" });
  });

  it("makes no network call (global fetch is never invoked)", async () => {
    const fetchSpy = jest.fn();
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      await createNotConfiguredModelClient().generateStructuredJson(baseInput);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe("createMockModelClient", () => {
  it("returns a default structured JSON success and records the call", async () => {
    const client = createMockModelClient();
    const result = await client.generateStructuredJson(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe("{}");
    expect(result.finishReason).toBe("stop");
    expect(result.feature).toBe("creation");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.input).toBe(baseInput);
  });

  it("honors a static `respond` result verbatim", async () => {
    const canned: ModelResult = {
      ok: true,
      modelId: "test-model",
      feature: "creation",
      text: '{"intentSummary":"x"}',
      finishReason: "stop",
    };
    const client = createMockModelClient({ respond: canned });
    await expect(client.generateStructuredJson(baseInput)).resolves.toBe(canned);
  });

  it("honors a `respond` function with the per-call index", async () => {
    const client = createMockModelClient({
      respond: (input, index) => ({
        ok: true,
        modelId: "fn-model",
        feature: input.feature,
        text: `call-${index}`,
        finishReason: "stop",
      }),
    });
    const first = await client.generateStructuredJson(baseInput);
    const second = await client.generateStructuredJson(baseInput);
    expect(first.ok && first.text).toBe("call-0");
    expect(second.ok && second.text).toBe("call-1");
    expect(client.calls).toHaveLength(2);
  });

  it("uses the `text` convenience and resolved model id", async () => {
    const client = createMockModelClient({ text: '{"ok":true}' });
    const result = await client.generateStructuredJson({ ...baseInput, tier: "fast" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{"ok":true}');
    expect(result.modelId).toBe(MODELS.fast.id);
  });

  it("makes no network call", async () => {
    const fetchSpy = jest.fn();
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    try {
      await createMockModelClient().generateStructuredJson(baseInput);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});
