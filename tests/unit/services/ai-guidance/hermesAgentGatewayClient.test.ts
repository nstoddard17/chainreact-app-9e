/**
 * @jest-environment node
 *
 * Hermes Agent gateway client (HERMES-AGENT-PROD-CLIENT).
 * Proves: disabled/unconfigured → no network; success path normalizes to advisory guidance;
 * 401/403/500 → typed PROVIDER_ERROR; timeout → typed TIMEOUT; the gateway token is ONLY in the
 * Authorization header (never in the body); the body never contains the OpenAI key / API_SERVER_KEY
 * / internal token / private Hermes URL. NO live network (injected mock fetch); needs no real env.
 */

import {
  createHermesAgentGatewayProvider,
  requestHermesAgentGuidance,
  type GatewayFetch,
  type GatewayHttpResponse,
} from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import { HERMES_AGENT_ENV, type HermesAgentGatewayConfig } from "@/services/ai-guidance/gateway/gatewayConfig";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

const TOKEN = "gateway-secret-NEVER-LOGGED-aa11bb22";
const CONFIG: HermesAgentGatewayConfig = {
  gatewayUrl: "https://gw.example.com",
  gatewayToken: TOKEN,
  timeoutMs: 5_000,
};

// Secrets that must NEVER reach the request body (they belong only on Render).
const FORBIDDEN_IN_BODY = {
  OPENAI_API_KEY: "sk-openai-FORBIDDEN-should-never-leave-render-0000",
  API_SERVER_KEY: "api-server-key-FORBIDDEN-render-only",
  HERMES_AGENT_INTERNAL_TOKEN: "internal-token-FORBIDDEN-render-only",
  HERMES_AGENT_PRIVATE_URL: "http://chainreact-hermes-agent-prod:8642/v1",
};

const ENV = [
  HERMES_AGENT_ENV.enabled,
  HERMES_AGENT_ENV.gatewayUrl,
  HERMES_AGENT_ENV.gatewayToken,
  HERMES_AGENT_ENV.timeoutMs,
  ...Object.keys(FORBIDDEN_IN_BODY),
];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function okFetch(payload: unknown, status = 200): jest.MockedFunction<GatewayFetch> {
  return jest.fn<Promise<GatewayHttpResponse>, Parameters<GatewayFetch>>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
  }));
}

describe("gateway provider — gating (no env needed)", () => {
  it("flag OFF (default) → PROVIDER_DISABLED; fetch never called", async () => {
    const fetchImpl = okFetch({ guidance: "hi" });
    const res = await createHermesAgentGatewayProvider({ fetchImpl }).getWorkflowGuidance(REQUEST);
    expect(res).toEqual({ ok: false, code: "PROVIDER_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("flag ON but gateway env missing → PROVIDER_NOT_CONFIGURED; fetch never called", async () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    const fetchImpl = okFetch({ guidance: "hi" });
    const res = await createHermesAgentGatewayProvider({ fetchImpl }).getWorkflowGuidance(REQUEST);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("gateway client — request shape + secret discipline (mock fetch, no live call)", () => {
  it("POSTs the prompt; token ONLY in Authorization header, never in body; correct URL", async () => {
    const fetchImpl = okFetch({ guidance: "Ask: what triggers your follow-up?" });
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      goalText: "I forget to follow up with leads",
      fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://gw.example.com/api/hermes-agent/guidance");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["content-type"]).toBe("application/json");
    const parsedBody = JSON.parse(init.body) as { prompt: string };
    expect(typeof parsedBody.prompt).toBe("string");
    // Token must appear ONLY in the header, never in the serialized body.
    expect(init.body).not.toContain(TOKEN);
  });

  it("request body never contains the OpenAI key / API_SERVER_KEY / internal token / private URL", async () => {
    for (const [k, v] of Object.entries(FORBIDDEN_IN_BODY)) process.env[k] = v;
    const fetchImpl = okFetch({ guidance: "ok" });
    await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      goalText: "help me build a follow-up workflow",
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    for (const v of Object.values(FORBIDDEN_IN_BODY)) expect(init.body).not.toContain(v);
  });

  it("normalizes a prose reply into a single advisory guidance suggestion", async () => {
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      fetchImpl: okFetch({ guidance: "Let's start with what app your leads live in." }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.providerId).toBe("hermes-agent");
      expect(res.response.suggestions[0]!.detail).toContain("leads live in");
    }
  });

  it("accepts a raw string body and OpenAI-style choices shape", async () => {
    const r1 = await requestHermesAgentGuidance({ request: REQUEST, config: CONFIG, fetchImpl: okFetch("plain prose guidance") });
    expect(r1.ok).toBe(true);
    const r2 = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      fetchImpl: okFetch({ choices: [{ message: { content: "from choices" } }] }),
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.response.suggestions[0]!.detail).toBe("from choices");
  });

  it("gateway success envelope {ok:true, response:{...}} → extracts nested guidance", async () => {
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      fetchImpl: okFetch({ ok: true, response: { guidance: "What app do your leads live in?" } }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.response.suggestions[0]!.detail).toContain("leads live in");
  });

  it("gateway error envelope {ok:false, error} → typed PROVIDER_ERROR with the safe code, no nested message", async () => {
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      fetchImpl: okFetch({
        ok: false,
        error: "HERMES_AGENT_ERROR",
        response: { error: { message: "HTTP 401: Missing Authentication header" } },
      }),
    });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: "HERMES_AGENT_ERROR" });
    // The downstream message must NOT leak through.
    expect(JSON.stringify(res)).not.toContain("Missing Authentication");
  });

  it("401/403/500 → typed PROVIDER_ERROR with safe status reason", async () => {
    for (const status of [401, 403, 500]) {
      const res = await requestHermesAgentGuidance({ request: REQUEST, config: CONFIG, fetchImpl: okFetch({}, status) });
      expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: `status_${status}` });
    }
  });

  it("empty / unusable reply → INVALID_RESPONSE (fail closed)", async () => {
    const res = await requestHermesAgentGuidance({ request: REQUEST, config: CONFIG, fetchImpl: okFetch({ unrelated: 1 }) });
    expect(res).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("a plan-like reply with unknown capabilities fails CLOSED (INVALID_RESPONSE)", async () => {
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: CONFIG,
      fetchImpl: okFetch({ guidance: "here", plan: { steps: [{ ref: "s0", role: "action", provider: "totally-fake", type: "nope" }] } }),
    });
    expect(res).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("an aborted/timed-out request → typed TIMEOUT", async () => {
    const abortFetch: GatewayFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    const res = await requestHermesAgentGuidance({
      request: REQUEST,
      config: { ...CONFIG, timeoutMs: 20 },
      fetchImpl: abortFetch,
    });
    expect(res).toEqual({ ok: false, code: "TIMEOUT" });
  });

  it("a transport error → typed PROVIDER_ERROR (transport_error)", async () => {
    const throwFetch: GatewayFetch = async () => {
      throw new Error("network down");
    };
    const res = await requestHermesAgentGuidance({ request: REQUEST, config: CONFIG, fetchImpl: throwFetch });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: "transport_error" });
  });
});
