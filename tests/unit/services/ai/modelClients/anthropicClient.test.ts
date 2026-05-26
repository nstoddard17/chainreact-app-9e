/**
 * @jest-environment node
 *
 * Tests for services/ai/modelClients/anthropicClient.ts (Slice 4.AI-8C).
 *
 * The adapter's fetch is INJECTED (fetchImpl) so no test touches the network.
 * These pin: success → ModelSuccess (text/usage/finishReason/latency), the
 * request shape (system split, x-api-key header), the full provider/network/
 * parse error mapping, and the no-leak guarantee (the API key never appears in
 * any result).
 */
import { createAnthropicModelClient } from "@/services/ai/modelClients/anthropicClient";
import { MODELS } from "@/core/ai/models";
import type { ModelGenerateInput } from "@/core/ai/modelTypes";

const API_KEY = "sk-ant-SECRET-TEST-KEY-do-not-leak";

const input: ModelGenerateInput = {
  feature: "creation",
  messages: [
    { role: "system", content: "You are a planner." },
    { role: "user", content: "make a workflow" },
  ],
};

function mockResponse(opts: {
  status: number;
  json?: unknown;
  text?: string;
  jsonThrows?: boolean;
}): Response {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    json: async () => {
      if (opts.jsonThrows) throw new SyntaxError("bad json");
      return opts.json;
    },
    text: async () => opts.text ?? JSON.stringify(opts.json ?? {}),
  } as unknown as Response;
}

function successBody(text = '{"intentSummary":"x"}', stopReason = "end_turn") {
  return {
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    usage: { input_tokens: 11, output_tokens: 22 },
  };
}

function client(fetchImpl: jest.Mock) {
  return createAnthropicModelClient({ apiKey: API_KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
}

describe("success", () => {
  it("maps a 200 response to ModelSuccess with text/usage/finishReason/latency", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: successBody() }));
    const result = await client(fetchImpl).generateStructuredJson(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{"intentSummary":"x"}');
    expect(result.modelId).toBe(MODELS.strong.id); // creation → strong
    expect(result.feature).toBe("creation");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(typeof result.latencyMs).toBe("number");
  });

  it("maps stop_reason max_tokens to finishReason length", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: successBody("{}", "max_tokens") }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok && result.finishReason).toBe("length");
  });

  it("sends the model id, split system, user turns, and the x-api-key header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: successBody() }));
    await client(fetchImpl).generateStructuredJson(input);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/v1/messages");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers["x-api-key"]).toBe(API_KEY);
    expect(reqInit.headers["anthropic-version"]).toBeDefined();

    const body = JSON.parse(reqInit.body);
    expect(body.model).toBe(MODELS.strong.id);
    expect(body.system).toBe("You are a planner.");
    // Claude 4.x rejects assistant-message prefill — the request must end on a
    // user turn. See the anthropicClient.ts header comment for the regression
    // log (Slice 4.AI-12C revert).
    expect(body.messages).toEqual([{ role: "user", content: "make a workflow" }]);
    expect(body.max_tokens).toBe(MODELS.strong.maxOutputTokens);
  });
});

describe("error mapping", () => {
  it("maps HTTP 429 to RATE_LIMITED (retryable)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 429, text: '{"error":{"type":"rate_limit","message":"slow down"}}' }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
  });

  it("maps HTTP 500 to PROVIDER_ERROR (retryable)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 500, text: "oops" }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("PROVIDER_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("maps HTTP 400 to PROVIDER_ERROR (not retryable) with a sanitized message", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 400, text: '{"error":{"type":"invalid_request","message":"bad model"}}' }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("PROVIDER_ERROR");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("invalid_request");
  });

  it("maps unparseable 200 body to INVALID_RESPONSE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, jsonThrows: true }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
  });

  it("maps an empty content array to EMPTY_RESPONSE", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: { content: [], stop_reason: "end_turn" } }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("EMPTY_RESPONSE");
  });

  it("maps a non-abort fetch throw to NETWORK_ERROR", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NETWORK_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("maps an AbortError to TIMEOUT", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("TIMEOUT");
  });

  it("rejects a prompt with no user/assistant turns as INVALID_INPUT (no fetch)", async () => {
    const fetchImpl = jest.fn();
    const result = await client(fetchImpl).generateStructuredJson({
      feature: "creation",
      messages: [{ role: "system", content: "only system" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_INPUT");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ─── Slice 4.AI-19 — forced tool-use structured output ───────────────────────
describe("structured output via forced tool-use", () => {
  const TOOL = {
    name: "propose_workflow_plan",
    description: "Return the workflow plan response object.",
    inputSchema: {
      type: "object",
      properties: { intentSummary: { type: "string" } },
    },
  } as const;

  const toolInput = {
    intentSummary: "post to slack",
    assumptions: [],
    requiredUserInput: [],
    proposedPatch: null,
    confidence: "high",
    safetyNotes: [],
    unsupportedRequests: [],
  };

  function toolUseBody(name: string = TOOL.name, payload: unknown = toolInput) {
    return {
      content: [{ type: "tool_use", id: "toolu_test", name, input: payload }],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 7 },
    };
  }

  it("sends `tools` + `tool_choice` on the request body when responseTool is set", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: toolUseBody() }));
    await client(fetchImpl).generateStructuredJson({ ...input, responseTool: TOOL });
    const reqInit = fetchImpl.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(reqInit.body);
    expect(body.tools).toEqual([
      {
        name: TOOL.name,
        description: TOOL.description,
        input_schema: TOOL.inputSchema,
      },
    ]);
    expect(body.tool_choice).toEqual({ type: "tool", name: TOOL.name });
    // Other fields still present.
    expect(body.messages).toEqual([{ role: "user", content: "make a workflow" }]);
  });

  it("omits `tools` + `tool_choice` when responseTool is absent (backward-compatible)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: successBody() }));
    await client(fetchImpl).generateStructuredJson(input);
    const reqInit = fetchImpl.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(reqInit.body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("returns ModelSuccess with JSON.stringify(tool_use.input) as text on tool_use response", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: toolUseBody() }));
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // text should be the canonical JSON serialization of the tool input.
    expect(JSON.parse(result.text)).toEqual(toolInput);
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
    // stop_reason: tool_use → finishReason: stop (per mapStopReason).
    expect(result.finishReason).toBe("stop");
  });

  it("ignores text-only responses when responseTool was forced (INVALID_RESPONSE, retryable)", async () => {
    // Model regression mode — returned prose instead of calling the tool. This
    // is the exact failure forced tool-use solves; we deliberately do NOT
    // fall back to text parsing.
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: successBody("{\"intent\":\"x\"}") }));
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
    expect(result.retryable).toBe(true);
    expect(result.message).toContain("propose_workflow_plan");
  });

  it("ignores a tool_use block whose name doesn't match (INVALID_RESPONSE)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 200,
        json: toolUseBody("some_other_tool"),
      }),
    );
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
  });

  it("maps a tool_use block with no input to INVALID_RESPONSE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 200,
        json: {
          content: [{ type: "tool_use", id: "toolu_test", name: TOOL.name }],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    );
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
    expect(result.message).toContain("no input payload");
  });

  it("returns INVALID_RESPONSE when the response content is missing entirely", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 200,
        json: { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 0 } },
      }),
    );
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
  });

  it("preserves existing HTTP error mapping under structured mode (429 → RATE_LIMITED)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 429,
        text: '{"error":{"type":"rate_limit","message":"slow down"}}',
      }),
    );
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
  });

  it("preserves AbortError → TIMEOUT mapping under structured mode", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const result = await client(fetchImpl).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("TIMEOUT");
  });

  it("never leaks the API key under structured mode (success or failure)", async () => {
    const okFetch = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: toolUseBody() }));
    const okResult = await client(okFetch).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    const errFetch = jest
      .fn()
      .mockResolvedValue(mockResponse({ status: 200, json: successBody("oops") }));
    const errResult = await client(errFetch).generateStructuredJson({
      ...input,
      responseTool: TOOL,
    });
    for (const serialized of [JSON.stringify(okResult), JSON.stringify(errResult)]) {
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain("sk-ant-");
    }
  });
});

describe("no live calls + no-leak", () => {
  it("uses the injected fetch, never global fetch", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: successBody() }));
    const globalSpy = jest.fn();
    const original = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = globalSpy;
    try {
      await client(fetchImpl).generateStructuredJson(input);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(globalSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("never leaks the API key in a success or failure result", async () => {
    const okFetch = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: successBody() }));
    const okResult = await client(okFetch).generateStructuredJson(input);
    const errFetch = jest.fn().mockResolvedValue(mockResponse({ status: 500, text: "boom" }));
    const errResult = await client(errFetch).generateStructuredJson(input);

    for (const serialized of [JSON.stringify(okResult), JSON.stringify(errResult)]) {
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain("sk-ant-");
      expect(serialized).not.toContain("x-api-key");
    }
  });
});
