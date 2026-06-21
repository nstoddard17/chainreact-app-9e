/**
 * @jest-environment node
 *
 * React Agent capability: workflow_guidance_intake (HERMES-AGENT-CAPABILITY).
 * Proves: the capability is registered with advisory/read-only/no-mutation metadata; disabled /
 * unconfigured → unavailable with NO fetch; a valid gateway envelope → advisory guidanceText; a
 * gateway provider error maps to a safe typed failure; invalid scope is enforced via the governance
 * seam (no fetch); the audit recorder emits one safe row on success AND failure with no secrets /
 * raw prompt / guidance text. NO live network (injected mock fetch); needs no real gateway.
 */

import {
  runWorkflowGuidanceIntakeCapability,
  WORKFLOW_GUIDANCE_INTAKE_CAPABILITY_ID,
  WORKFLOW_GUIDANCE_INTAKE_INTENT,
} from "@/services/ai/reactAgent/capabilities/workflowGuidanceIntake";
import { getReactAgentCapability } from "@/services/ai/reactAgent";
import { HERMES_AGENT_ENV } from "@/services/ai-guidance/gateway/gatewayConfig";
import type { GatewayFetch, GatewayHttpResponse } from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import type { ReactAgentScope } from "@/services/ai/reactAgent";

const SCOPE: ReactAgentScope = { userId: "u1", accountId: "acc1", workflowId: "wf1" };
const GATEWAY_URL = "https://gw.example.com";
const GATEWAY_TOKEN = "gateway-secret-NEVER-IN-AUDIT-aa11";

function envelope(content: string): unknown {
  return { ok: true, response: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } };
}

function okFetch(payload: unknown, status = 200): jest.MockedFunction<GatewayFetch> {
  return jest.fn<Promise<GatewayHttpResponse>, Parameters<GatewayFetch>>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
}

function recorder() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { auditRecorder: { record }, record };
}

const ENV = [HERMES_AGENT_ENV.enabled, HERMES_AGENT_ENV.gatewayUrl, HERMES_AGENT_ENV.gatewayToken, HERMES_AGENT_ENV.timeoutMs];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function enable(): void {
  process.env[HERMES_AGENT_ENV.enabled] = "true";
  process.env[HERMES_AGENT_ENV.gatewayUrl] = GATEWAY_URL;
  process.env[HERMES_AGENT_ENV.gatewayToken] = GATEWAY_TOKEN;
}

describe("workflow_guidance_intake — registry metadata (advisory / no mutation)", () => {
  it("is registered read_only for request_workflow_guidance, gated as workflow_guidance", () => {
    expect(getReactAgentCapability(WORKFLOW_GUIDANCE_INTAKE_CAPABILITY_ID)).toMatchObject({
      id: "workflow_guidance_intake",
      allowedIntent: WORKFLOW_GUIDANCE_INTAKE_INTENT,
      mode: "read_only",
      creditFeature: "workflow_guidance",
      auditKind: "react_agent.workflow_guidance_intake",
    });
  });
});

describe("workflow_guidance_intake — gating (no fetch when off/unconfigured)", () => {
  it("disabled (flag off) → PROVIDER_DISABLED; fetch never called", async () => {
    const fetchImpl = okFetch(envelope("hi"));
    const res = await runWorkflowGuidanceIntakeCapability({ scope: SCOPE, goalText: "help" }, { fetchImpl });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("enabled but gateway env missing → PROVIDER_NOT_CONFIGURED; fetch never called", async () => {
    process.env[HERMES_AGENT_ENV.enabled] = "true";
    const fetchImpl = okFetch(envelope("hi"));
    const res = await runWorkflowGuidanceIntakeCapability({ scope: SCOPE, goalText: "help" }, { fetchImpl });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("workflow_guidance_intake — advisory result + governance", () => {
  it("a valid gateway envelope → ok with non-empty guidanceText, source, workflowPlan null", async () => {
    enable();
    const fetchImpl = okFetch(envelope("What app do your leads live in?"));
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "I keep forgetting to follow up with leads" },
      { fetchImpl },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.source).toBe("hermes-agent");
      expect(res.guidanceText).toContain("leads live in");
      expect(res.workflowPlan).toBeNull();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a gateway provider error maps to a safe typed failure (PROVIDER_ERROR)", async () => {
    enable();
    const fetchImpl = okFetch({ ok: false, error: "HERMES_AGENT_ERROR", response: { error: { message: "downstream secret detail" } } });
    const res = await runWorkflowGuidanceIntakeCapability({ scope: SCOPE, goalText: "help" }, { fetchImpl });
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(JSON.stringify(res)).not.toContain("downstream secret detail");
  });

  it("invalid scope is enforced via the governance seam → INVALID_SCOPE, no fetch", async () => {
    enable();
    const fetchImpl = okFetch(envelope("hi"));
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: { userId: "", accountId: "acc1" }, goalText: "help" },
      { fetchImpl },
    );
    expect(res).toMatchObject({ ok: false, code: "INVALID_SCOPE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("workflow_guidance_intake — audit (safe metadata only)", () => {
  it("emits ONE success audit row with registry+scope fields and NO prompt/guidance/secret", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "my private goal text SECRET-GOAL" },
      { fetchImpl: okFetch(envelope("private guidance ANSWER-TEXT")), auditRecorder },
    );
    expect(res.ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    const input = record.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({
      accountId: "acc1",
      actorUserId: "u1",
      workflowId: "wf1",
      capabilityId: "workflow_guidance_intake",
      intent: "request_workflow_guidance",
      mode: "read_only",
      creditFeature: "workflow_guidance",
      auditKind: "react_agent.workflow_guidance_intake",
      outcome: "success",
    });
    expect(input).not.toHaveProperty("metadata");
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("SECRET-GOAL");
    expect(serialized).not.toContain("ANSWER-TEXT");
    expect(serialized).not.toContain(GATEWAY_TOKEN);
  });

  it("emits a `failed` audit row when the gateway errors", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "help" },
      { fetchImpl: okFetch({ ok: false, error: "HERMES_AGENT_ERROR" }), auditRecorder },
    );
    expect(record.mock.calls[0]![0]).toMatchObject({ capabilityId: "workflow_guidance_intake", outcome: "failed" });
  });

  it("emits a `denied` audit row for invalid scope and runs no fetch", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    const fetchImpl = okFetch(envelope("hi"));
    await runWorkflowGuidanceIntakeCapability(
      { scope: { userId: "", accountId: "acc1" }, goalText: "help" },
      { fetchImpl, auditRecorder },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "denied", reason: "invalid_scope" });
  });
});
