/** @jest-environment node */
import type { ModelClient, ModelGenerateInput, ModelResult } from "@/core/ai/modelTypes";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import { createFirstPartyProcessorClient } from "@/services/ai/processor/firstPartyClient";
import { normalizeGatewayProcessResponse } from "@/services/ai/processor/gatewayClient";
import { buildFirstPartyRequestShape } from "@/services/ai/processor/requestShapes";
import { outputJsonSchemaFor } from "@/services/ai/processor/responseSchemas";
import type { AiProcessRequest } from "@/services/ai/processor/types";

const REQUEST: AiProcessRequest = {
  task: "analyze_document",
  mode: "classify",
  document: {
    name: "doc.pdf",
    mimeType: "application/pdf",
    truncated: false,
    segments: [{ label: "Page 1", text: "INVOICE #42 due June 30" }],
  },
  labels: ["invoice", "bill_of_lading"],
  allowOtherLabel: true,
  limits: { maxRows: 100, maxOutputTokens: 1000 },
};

const GOOD_RESULT = { label: "invoice", confidence: 0.94 };

function stubModelClient(
  result: ModelResult | ((input: ModelGenerateInput) => ModelResult),
): { client: ModelClient; calls: ModelGenerateInput[] } {
  const calls: ModelGenerateInput[] = [];
  return {
    calls,
    client: {
      async generateStructuredJson(input) {
        calls.push(input);
        return typeof result === "function" ? result(input) : result;
      },
    },
  };
}

const ok = (text: string): ModelResult => ({
  ok: true,
  modelId: "gpt-4.1-mini",
  feature: "data_qa",
  text,
  finishReason: "stop",
  usage: { inputTokens: 500, outputTokens: 20 },
});

describe("first-party processor client", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = Object.values(AI_PROCESSOR_ENV);
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.provider] = "first_party";
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("disabled processor performs no model call", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    const { client, calls } = stubModelClient(ok(JSON.stringify(GOOD_RESULT)));
    const result = await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "DISABLED" }));
    expect(calls).toHaveLength(0);
  });

  it("sends the SHARED request shape: responseTool.inputSchema === gateway outputSchema", async () => {
    const { client, calls } = stubModelClient(ok(JSON.stringify(GOOD_RESULT)));
    await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.responseTool?.inputSchema).toEqual(outputJsonSchemaFor(REQUEST));
    expect(sent.responseTool?.name).toBe("return_document_analysis");
    expect(sent.messages).toEqual(buildFirstPartyRequestShape(REQUEST).messages);
    expect(sent.maxOutputTokens).toBe(1000);
  });

  it("parity: the same result object validates identically on both paths", async () => {
    // First-party path
    const { client } = stubModelClient(ok(JSON.stringify(GOOD_RESULT)));
    const fp = await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    // Gateway path (same payload delivered via the envelope)
    const gw = normalizeGatewayProcessResponse(
      { ok: true, result: GOOD_RESULT, modelTag: "hermes-doc-v1" },
      REQUEST,
    );
    expect(fp.ok).toBe(true);
    expect(gw.ok).toBe(true);
    if (!fp.ok || !gw.ok) throw new Error("expected ok");
    expect(fp.payload).toEqual(gw.payload);
    expect(fp.source).toBe("first_party");
    expect(gw.source).toBe("gateway");
  });

  it("parity: an invalid structured result fails identically on both paths", async () => {
    const bad = { label: "", confidence: 3 };
    const { client } = stubModelClient(ok(JSON.stringify(bad)));
    const fp = await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    const gw = normalizeGatewayProcessResponse({ ok: true, result: bad }, REQUEST);
    expect(fp).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
    expect(gw).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });

  it("maps model failure codes onto processor codes", async () => {
    const cases: Array<[string, string, boolean]> = [
      ["NOT_CONFIGURED", "NOT_CONFIGURED", false],
      ["CONFIGURATION_ERROR", "NOT_CONFIGURED", false],
      ["TIMEOUT", "TIMEOUT", true],
      ["RATE_LIMITED", "RATE_LIMITED", true],
      ["PROVIDER_ERROR", "PROVIDER_ERROR", true],
      ["NETWORK_ERROR", "PROVIDER_ERROR", true],
      ["INVALID_RESPONSE", "INVALID_RESPONSE", false],
      ["EMPTY_RESPONSE", "INVALID_RESPONSE", false],
    ];
    for (const [modelCode, processorCode, retryable] of cases) {
      const { client } = stubModelClient({
        ok: false,
        modelId: "gpt-4.1-mini",
        feature: "data_qa",
        failureCode: modelCode as never,
        message: "safe message",
      });
      const result = await createFirstPartyProcessorClient({ modelClient: client }).process(
        REQUEST,
      );
      expect(result).toEqual(
        expect.objectContaining({ ok: false, code: processorCode, retryable }),
      );
    }
  });

  it("content_filter finish → CONTENT_REFUSED", async () => {
    const { client } = stubModelClient({
      ok: true,
      modelId: "gpt-4.1-mini",
      feature: "data_qa",
      text: JSON.stringify(GOOD_RESULT),
      finishReason: "content_filter",
    });
    const result = await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "CONTENT_REFUSED" }));
  });

  it("non-JSON model text → INVALID_RESPONSE", async () => {
    const { client } = stubModelClient(ok("I think the label is invoice"));
    const result = await createFirstPartyProcessorClient({ modelClient: client }).process(REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });
});
