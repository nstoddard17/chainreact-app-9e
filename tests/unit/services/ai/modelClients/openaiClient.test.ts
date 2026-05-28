/**
 * @jest-environment node
 *
 * Tests for services/ai/modelClients/openaiClient.ts (Slice 4.AI-34A).
 *
 * The adapter's fetch is INJECTED (fetchImpl) so no test touches the network.
 * These pin: success → ModelSuccess (text/usage/finishReason/latency), the
 * Responses-API request shape (system→instructions split, Bearer auth header,
 * function-tool + tool_choice when responseTool is set), forced-tool extraction
 * of `function_call.arguments`, the full provider/network/parse error mapping,
 * and the no-leak guarantee (the API key never appears in any result).
 *
 * The adapter resolves the OpenAI registry, so a `creation` request →
 * OPENAI_MODELS.strong (gpt-4.1), NOT the default Anthropic model.
 */
import { createOpenAiModelClient } from "@/services/ai/modelClients/openaiClient";
import { OPENAI_MODELS } from "@/core/ai/models";
import type { ModelGenerateInput } from "@/core/ai/modelTypes";

const API_KEY = "sk-openai-SECRET-TEST-KEY-do-not-leak";

const input: ModelGenerateInput = {
  feature: "creation",
  messages: [
    { role: "system", content: "You are a planner." },
    { role: "user", content: "make a workflow" },
  ],
};

const toolInput: ModelGenerateInput = {
  ...input,
  responseTool: {
    name: "propose_workflow_plan",
    description: "Return the plan.",
    inputSchema: { type: "object", properties: {} },
  },
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

function textBody(text = '{"intentSummary":"x"}', status = "completed") {
  return {
    output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
    status,
    usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 },
  };
}

function toolBody(args = '{"intentSummary":"x"}', name = "propose_workflow_plan") {
  return {
    output: [{ type: "function_call", name, arguments: args, call_id: "call_1" }],
    status: "completed",
    usage: { input_tokens: 5, output_tokens: 6 },
  };
}

function client(fetchImpl: jest.Mock) {
  return createOpenAiModelClient({ apiKey: API_KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
}

describe("success — text path", () => {
  it("maps a 200 message response to ModelSuccess with text/usage/finishReason/latency", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: textBody() }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{"intentSummary":"x"}');
    expect(result.modelId).toBe(OPENAI_MODELS.strong.id); // creation → strong, OpenAI registry
    expect(result.feature).toBe("creation");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(typeof result.latencyMs).toBe("number");
  });

  it("uses the top-level output_text convenience field when present", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ status: 200, json: { output: [], output_text: "{}", status: "completed" } }),
    );
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok && result.text).toBe("{}");
  });

  it("maps status incomplete + max_output_tokens to finishReason length", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({
        status: 200,
        json: { output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }], status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
      }),
    );
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok && result.finishReason).toBe("length");
  });
});

describe("success — forced tool path", () => {
  it("returns the function_call arguments verbatim as text", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: toolBody() }));
    const result = await client(fetchImpl).generateStructuredJson(toolInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('{"intentSummary":"x"}');
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 6 });
  });

  it("sends a flat function tool + forced tool_choice in the request body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: toolBody() }));
    await client(fetchImpl).generateStructuredJson(toolInput);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as { body: string }).body);
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "propose_workflow_plan",
        description: "Return the plan.",
        parameters: { type: "object", properties: {} },
      },
    ]);
    expect(body.tool_choice).toEqual({ type: "function", name: "propose_workflow_plan" });
  });

  it("INVALID_RESPONSE (retryable) when the forced tool was not called", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: textBody() }));
    const result = await client(fetchImpl).generateStructuredJson(toolInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
    expect(result.retryable).toBe(true);
  });

  it("INVALID_RESPONSE when the tool call name mismatches", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ status: 200, json: toolBody("{}", "some_other_tool") }),
    );
    const result = await client(fetchImpl).generateStructuredJson(toolInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
  });
});

describe("request shape", () => {
  it("splits system into instructions + user/assistant into input, POSTs /v1/responses with Bearer auth", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: textBody() }));
    await client(fetchImpl).generateStructuredJson(input);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse((init as { body: string }).body);
    expect(body.instructions).toBe("You are a planner.");
    expect(body.input).toEqual([{ role: "user", content: "make a workflow" }]);
    expect(body.model).toBe(OPENAI_MODELS.strong.id);
  });

  it("INVALID_INPUT when there are no user/assistant turns", async () => {
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

describe("error mapping", () => {
  it("429 → RATE_LIMITED (retryable)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ status: 429, text: JSON.stringify({ error: { type: "rate_limit", message: "slow down" } }) }),
    );
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("RATE_LIMITED");
    expect(result.retryable).toBe(true);
  });

  it("500 → PROVIDER_ERROR (retryable)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 500, text: "{}" }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok && "unreachable").toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("PROVIDER_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("400 → PROVIDER_ERROR (not retryable)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 400, text: "{}" }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("PROVIDER_ERROR");
    expect(result.retryable).toBe(false);
  });

  it("invalid JSON body → INVALID_RESPONSE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, jsonThrows: true }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("INVALID_RESPONSE");
  });

  it("empty text → EMPTY_RESPONSE", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ status: 200, json: { output: [], status: "completed" } }),
    );
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("EMPTY_RESPONSE");
  });

  it("aborted fetch → TIMEOUT", async () => {
    const fetchImpl = jest.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("TIMEOUT");
  });

  it("network throw → NETWORK_ERROR", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failureCode).toBe("NETWORK_ERROR");
  });
});

describe("no-leak", () => {
  it("never echoes the API key in a success result", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: textBody() }));
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("never echoes the API key in an error result", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      mockResponse({ status: 401, text: JSON.stringify({ error: { message: "bad key" } }) }),
    );
    const result = await client(fetchImpl).generateStructuredJson(input);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it("does not put the API key in the request body (only the auth header)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 200, json: textBody() }));
    await client(fetchImpl).generateStructuredJson(input);
    const init = fetchImpl.mock.calls[0]![1] as { body: string };
    expect(init.body).not.toContain(API_KEY);
  });
});
