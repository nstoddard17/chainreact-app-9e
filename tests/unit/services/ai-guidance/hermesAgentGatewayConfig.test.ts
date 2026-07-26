/**
 * @jest-environment node
 *
 * Hermes Agent gateway config reader (HERMES-AGENT-PROD-CLIENT).
 * Proves: disabled/missing env → null (no crash); enabled+configured → config; the SAFE status
 * reports missing var NAMES only (never the token value); timeout defaults + clamps. No real env.
 */

import {
  getHermesAgentGatewayConfig,
  describeHermesAgentConfigStatus,
  isHermesAgentEnabled,
  HERMES_AGENT_ENV,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  GUIDANCE_ROUTE_MAX_DURATION_SECONDS,
} from "@/services/ai-guidance/gateway/gatewayConfig";

const ENV = [HERMES_AGENT_ENV.enabled, HERMES_AGENT_ENV.gatewayUrl, HERMES_AGENT_ENV.gatewayToken, HERMES_AGENT_ENV.timeoutMs];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const TOKEN = "gw-token-NEVER-IN-STATUS-aa11";

describe("getHermesAgentGatewayConfig", () => {
  it("disabled (flag unset) → null even when url/token present", () => {
    process.env[HERMES_AGENT_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    expect(isHermesAgentEnabled()).toBe(false);
    expect(getHermesAgentGatewayConfig()).toBeNull();
  });

  it("enabled but missing url/token → null (no crash)", () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    expect(getHermesAgentGatewayConfig()).toBeNull();
  });

  it("enabled + configured → config; default timeout 45000; clamps out-of-range", () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    process.env[HERMES_AGENT_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    expect(getHermesAgentGatewayConfig()).toEqual({ gatewayUrl: "https://gw.example.com", gatewayToken: TOKEN, timeoutMs: 45_000 });

    process.env[HERMES_AGENT_ENV.timeoutMs] = "999999999";
    expect(getHermesAgentGatewayConfig()?.timeoutMs).toBe(MAX_TIMEOUT_MS);
    process.env[HERMES_AGENT_ENV.timeoutMs] = "not-a-number";
    expect(getHermesAgentGatewayConfig()?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  /**
   * REACT-AGENT-RETRY-BACKOFF-1 (#3) — the EXACT production question, pinned.
   *
   * Marcus reported `HERMES_AGENT_TIMEOUT_MS=60000`. 60s is NOT safely inside a 60s `maxDuration`:
   * un-clamped it would let the gateway deadline and the platform kill land together, so the request
   * dies as a bodyless 504 instead of our typed 503. Case A holds — the value is clamped to 55s.
   */
  it("(#3) an explicit 60000 is clamped to 55000 — Case A, not Case B", () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    process.env[HERMES_AGENT_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    process.env[HERMES_AGENT_ENV.timeoutMs] = "60000";
    expect(getHermesAgentGatewayConfig()!.timeoutMs).toBe(55_000);
    expect(getHermesAgentGatewayConfig()!.timeoutMs).toBeLessThan(GUIDANCE_ROUTE_MAX_DURATION_SECONDS * 1_000);
  });

  /**
   * REACT-AGENT-PRODUCTION-TIMEOUT-1 — the abort must always fire INSIDE the serverless budget.
   * If the clamp ceiling ever creeps past `maxDuration`, a slow brain stops producing our typed 503
   * and starts producing an untyped platform 504 — exactly the failure mode this slice removed.
   */
  it("every reachable timeout stays inside the routes' maxDuration budget", () => {
    const budgetMs = GUIDANCE_ROUTE_MAX_DURATION_SECONDS * 1_000;
    expect(DEFAULT_TIMEOUT_MS).toBeLessThan(budgetMs);
    expect(MAX_TIMEOUT_MS).toBeLessThan(budgetMs);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TIMEOUT_MS);

    // An operator over-setting the env var is clamped, not honored.
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    process.env[HERMES_AGENT_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    process.env[HERMES_AGENT_ENV.timeoutMs] = String(budgetMs + 60_000);
    expect(getHermesAgentGatewayConfig()!.timeoutMs).toBeLessThan(budgetMs);
  });
});

describe("describeHermesAgentConfigStatus — names only, never the token value", () => {
  it("reports missing var NAMES and never leaks the token", () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    const status = describeHermesAgentConfigStatus();
    expect(status.enabled).toBe(true);
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([HERMES_AGENT_ENV.gatewayUrl]);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  });
});
