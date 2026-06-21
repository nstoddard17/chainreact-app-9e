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

  it("enabled + configured → config; default timeout 30000; clamps out-of-range", () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    process.env[HERMES_AGENT_ENV.gatewayUrl] = "https://gw.example.com";
    process.env[HERMES_AGENT_ENV.gatewayToken] = TOKEN;
    expect(getHermesAgentGatewayConfig()).toEqual({ gatewayUrl: "https://gw.example.com", gatewayToken: TOKEN, timeoutMs: 30_000 });

    process.env[HERMES_AGENT_ENV.timeoutMs] = "999999999";
    expect(getHermesAgentGatewayConfig()?.timeoutMs).toBe(120_000);
    process.env[HERMES_AGENT_ENV.timeoutMs] = "not-a-number";
    expect(getHermesAgentGatewayConfig()?.timeoutMs).toBe(30_000);
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
