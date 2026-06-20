/**
 * @jest-environment node
 *
 * Nous Hermes adapter (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 * Proves: OFF/unconfigured → no call; missing env doesn't break anything; the request is
 * OpenAI-compatible with the key ONLY in the Authorization header (never in messages/body
 * content); defensive parse; NO live network (injected mock fetch). Tests need no real env.
 */

import {
  createNousHermesGuidanceProvider,
  requestNousWorkflowGuidance,
  defaultCapabilityCatalog,
  type HermesFetch,
  type HermesHttpResponse,
} from "@/services/ai-guidance/nousHermesAdapter";
import { HOSTED_HERMES_GUIDANCE_FLAG } from "@/services/ai-guidance/flags";
import { HERMES_ENV, type HermesGuidanceConfig } from "@/services/ai-guidance/hermesConfig";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1, guidanceKind: "workflow_design",
  workflow: { nodeCount: 1, edgeCount: 0, nodes: [{ ref: "n0", kind: "action", provider: "gmail", type: "send_email" }], edges: [] },
};
const KEY = "test-secret-key-NEVER-LOGGED-aa11";
const CONFIG: HermesGuidanceConfig = {
  provider: "nous", baseUrl: "https://hermes.example/v1", apiKey: KEY,
  model: "nousresearch/hermes-4-70b", timeoutMs: 5000, maxOutputTokens: 1200, temperature: 0.3,
};

const ENV = [HOSTED_HERMES_GUIDANCE_FLAG, HERMES_ENV.provider, HERMES_ENV.baseUrl, HERMES_ENV.apiKey, HERMES_ENV.model, HERMES_ENV.timeoutMs, HERMES_ENV.maxOutputTokens, HERMES_ENV.temperature];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function okFetch(payload: unknown): jest.MockedFunction<HermesFetch> {
  return jest.fn<Promise<HermesHttpResponse>, Parameters<HermesFetch>>(async () => ({ ok: true, status: 200, json: async () => payload }));
}

describe("Nous adapter — gating (no env needed)", () => {
  it("flag OFF (default) → PROVIDER_DISABLED; fetch never called", async () => {
    const fetchImpl = okFetch({});
    const res = await createNousHermesGuidanceProvider({ fetchImpl }).getWorkflowGuidance(REQUEST);
    expect(res).toEqual({ ok: false, code: "PROVIDER_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("flag ON but HERMES_* missing → PROVIDER_NOT_CONFIGURED; fetch never called", async () => {
    process.env[HOSTED_HERMES_GUIDANCE_FLAG] = "true";
    const fetchImpl = okFetch({});
    const res = await createNousHermesGuidanceProvider({ fetchImpl }).getWorkflowGuidance(REQUEST);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Nous adapter — request shape + secret discipline (mock fetch, no live call)", () => {
  const goodPayload = { choices: [{ message: { content: JSON.stringify({ suggestions: [{ title: "Add a Stripe trigger", detail: "...", suggestedOperationKinds: ["addNode"] }] }) } }] };

  it("posts OpenAI-compatible chat completions; key ONLY in Authorization header, never in body", async () => {
    const fetchImpl = okFetch(goodPayload);
    const res = await requestNousWorkflowGuidance({ request: REQUEST, config: CONFIG, capabilityCatalog: ["gmail:send_email"], goalText: "notify me", fetchImpl });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://hermes.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body) as { model: string; max_tokens: number; temperature: number; messages: unknown };
    expect(body).toMatchObject({ model: CONFIG.model, max_tokens: 1200, temperature: 0.3 });
    // The KEY must appear ONLY in the header, never in the serialized message body.
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("parses suggestions from the model reply (defensive)", async () => {
    const res = await requestNousWorkflowGuidance({ request: REQUEST, config: CONFIG, capabilityCatalog: [], fetchImpl: okFetch(goodPayload) });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.response.suggestions[0]!.title).toBe("Add a Stripe trigger");
  });

  it("non-200 → PROVIDER_ERROR; unparseable content → INVALID_RESPONSE", async () => {
    const errFetch = jest.fn<Promise<HermesHttpResponse>, Parameters<HermesFetch>>(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    const r1 = await requestNousWorkflowGuidance({ request: REQUEST, config: CONFIG, capabilityCatalog: [], fetchImpl: errFetch });
    expect(r1).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    const r2 = await requestNousWorkflowGuidance({ request: REQUEST, config: CONFIG, capabilityCatalog: [], fetchImpl: okFetch({ choices: [{ message: { content: "not json" } }] }) });
    expect(r2).toMatchObject({ ok: false, code: "INVALID_RESPONSE" });
  });

  it("defaultCapabilityCatalog returns real provider:type keys from discovery", () => {
    const catalog = defaultCapabilityCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((k) => /^[^:]+:[^:]+$/.test(k))).toBe(true);
  });
});
