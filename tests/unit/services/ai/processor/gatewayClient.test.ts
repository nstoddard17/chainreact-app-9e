/** @jest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import {
  createGatewayProcessorClient,
  normalizeGatewayProcessResponse,
  type GatewayFetch,
} from "@/services/ai/processor/gatewayClient";
import { buildGatewayProcessBody } from "@/services/ai/processor/requestShapes";
import type { AiProcessRequest } from "@/services/ai/processor/types";
import { CANONICAL_REQUESTS, FIXTURES_DIR } from "./canonicalRequests";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));

const SUMMARIZE_REQUEST: AiProcessRequest = {
  task: "analyze_document",
  mode: "summarize",
  document: {
    name: "payroll.pdf",
    mimeType: "application/pdf",
    truncated: false,
    segments: [{ label: "Page 1", text: "June payroll summary." }],
  },
  limits: { maxRows: 100, maxOutputTokens: 2000 },
};

function mockFetch(
  handler: (url: string, init: Parameters<GatewayFetch>[1]) => {
    ok: boolean;
    status: number;
    jsonBody?: unknown;
    textBody?: string;
  },
): { fetchImpl: GatewayFetch; calls: Array<{ url: string; init: Parameters<GatewayFetch>[1] }> } {
  const calls: Array<{ url: string; init: Parameters<GatewayFetch>[1] }> = [];
  const fetchImpl: GatewayFetch = async (url, init) => {
    calls.push({ url, init });
    const out = handler(url, init);
    return {
      ok: out.ok,
      status: out.status,
      json: async () => {
        if (out.jsonBody === undefined) throw new SyntaxError("not json");
        return out.jsonBody;
      },
      text: async () => out.textBody ?? "",
    };
  };
  return { fetchImpl, calls };
}

describe("gateway processor client", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = Object.values(AI_PROCESSOR_ENV);

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env[AI_PROCESSOR_ENV.enabled] = "true";
    process.env[AI_PROCESSOR_ENV.gatewayUrl] = "https://gw.example.com/";
    process.env[AI_PROCESSOR_ENV.gatewayToken] = "gw-secret-token";
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("canonical request fixtures match the live builder (Render contract parity)", () => {
    for (const [name, { request, requestId }] of Object.entries(CANONICAL_REQUESTS)) {
      expect(buildGatewayProcessBody(request, requestId)).toEqual(
        fixture(`request.${name}.json`),
      );
    }
  });

  it("disabled → DISABLED with no network call", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    const { fetchImpl, calls } = mockFetch(() => ({ ok: true, status: 200, jsonBody: {} }));
    const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "DISABLED" }));
    expect(calls).toHaveLength(0);
  });

  it("missing gateway env → NOT_CONFIGURED with no network call", async () => {
    delete process.env[AI_PROCESSOR_ENV.gatewayToken];
    const { fetchImpl, calls } = mockFetch(() => ({ ok: true, status: 200, jsonBody: {} }));
    const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "NOT_CONFIGURED" }));
    expect(calls).toHaveLength(0);
  });

  it("success: posts the versioned body, token ONLY in the header, and validates the reply", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      ok: true,
      status: 200,
      jsonBody: fixture("response.analyze-summarize.success.json"),
    }));
    const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://gw.example.com/api/hermes-agent/process");
    expect(call.init.headers.authorization).toBe("Bearer gw-secret-token");
    // Token never in the serialized body; no account/user/workflow ids cross.
    expect(call.init.body).not.toContain("gw-secret-token");
    expect(call.init.body).not.toMatch(/accountId|userId|workflowId|membership|billing/);
    const body = JSON.parse(call.init.body) as Record<string, unknown>;
    expect(body.schemaVersion).toBe(1);
    expect(body.task).toBe("analyze_document");
    expect(typeof body.requestId).toBe("string");
    expect(body.outputSchema).toBeDefined();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.source).toBe("gateway");
    expect(result.modelTag).toBe("hermes-doc-v1");
    // Usage preserved as telemetry only.
    expect(result.usage).toEqual({ inputTokens: 1830, outputTokens: 96 });
  });

  it("timeout maps to TIMEOUT (retryable)", async () => {
    const fetchImpl: GatewayFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    process.env[AI_PROCESSOR_ENV.timeoutMs] = "5000"; // min clamp
    const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "TIMEOUT", retryable: true }),
    );
  }, 15_000);

  it("HTTP 429 → RATE_LIMITED retryable; 5xx → PROVIDER_ERROR retryable; 400 → not retryable", async () => {
    for (const [status, code, retryable] of [
      [429, "RATE_LIMITED", true],
      [502, "PROVIDER_ERROR", true],
      [400, "PROVIDER_ERROR", false],
    ] as const) {
      const { fetchImpl } = mockFetch(() => ({ ok: false, status }));
      const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);
      expect(result).toEqual(expect.objectContaining({ ok: false, code, retryable }));
    }
  });

  it("non-JSON reply fails closed as INVALID_RESPONSE", async () => {
    const { fetchImpl } = mockFetch(() => ({ ok: true, status: 200, textBody: "bad gateway" }));
    const result = await createGatewayProcessorClient({ fetchImpl }).process(SUMMARIZE_REQUEST);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });

  it("maps every documented gateway failure code", () => {
    const expectations: Array<[string, string, boolean]> = [
      ["response.failure.input-too-large.json", "INPUT_TOO_LARGE", false],
      ["response.failure.rate-limited.json", "RATE_LIMITED", true],
      ["response.failure.model-error.json", "PROVIDER_ERROR", true],
      ["response.failure.schema-unsatisfiable.json", "INVALID_RESPONSE", false],
      ["response.failure.content-refused.json", "CONTENT_REFUSED", false],
      ["response.failure.unsupported-task.json", "PROVIDER_ERROR", false],
      ["response.failure.internal.json", "PROVIDER_ERROR", true],
    ];
    for (const [file, code, retryable] of expectations) {
      const result = normalizeGatewayProcessResponse(fixture(file), SUMMARIZE_REQUEST);
      expect(result).toEqual(expect.objectContaining({ ok: false, code, retryable }));
    }
  });

  it("malformed success payload fails closed (result violates the task contract)", () => {
    const result = normalizeGatewayProcessResponse(
      fixture("response.malformed-success.json"),
      SUMMARIZE_REQUEST,
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });

  it("unexpected extra envelope keys fail closed (strict transport contract)", () => {
    const result = normalizeGatewayProcessResponse(
      fixture("response.unexpected-envelope.json"),
      SUMMARIZE_REQUEST,
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });

  it("a result for the WRONG task shape fails closed", () => {
    const result = normalizeGatewayProcessResponse(
      fixture("response.suggest-schema.success.json"),
      SUMMARIZE_REQUEST,
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INVALID_RESPONSE" }));
  });

  it("oversized serialized body is refused client-side as INPUT_TOO_LARGE", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ ok: true, status: 200, jsonBody: {} }));
    const huge: AiProcessRequest = {
      ...SUMMARIZE_REQUEST,
      document: {
        ...SUMMARIZE_REQUEST.document,
        segments: [{ label: "Page 1", text: "x".repeat(2 * 1024 * 1024 + 1) }],
      },
    };
    const result = await createGatewayProcessorClient({ fetchImpl }).process(huge);
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "INPUT_TOO_LARGE" }));
    expect(calls).toHaveLength(0);
  });
});
