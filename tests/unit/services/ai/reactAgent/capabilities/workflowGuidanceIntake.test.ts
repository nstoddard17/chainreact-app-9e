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

  it("HERMES-AGENT-MEMORY-SCOPE-GUARD: a foreign-member private connection becomes a generic notice in the prompt, no ids leak", async () => {
    enable();
    const fetchImpl = okFetch(envelope("ok"));
    await runWorkflowGuidanceIntakeCapability(
      {
        scope: { userId: "viewer-1", accountId: "acc1", workflowId: "wf1" },
        goalText: "improve this",
        definition: { nodes: [{ id: "n1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } }], edges: [] },
        contextInputs: { account: { type: "team" }, workflowCreatedByUserId: "creator-OTHER" },
      },
      { fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = String(fetchImpl.mock.calls[0]![1].body);
    expect(body).toContain("private connection owned by another member");
    expect(body).toContain("Use only the context included in this request");
    // The viewer/creator ids are used only for the comparison — they never reach the prompt.
    expect(body).not.toContain("viewer-1");
    expect(body).not.toContain("creator-OTHER");
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
    // REACT-AGENT-RETRY-BACKOFF-1 — the row previously carried NO metadata at all. It now carries a
    // small, CLOSED set of attempt counters (so one submission's internal retries are visible in the
    // single governance row). The no-leak guarantee is unchanged and re-pinned here as an exact key
    // allow-list: anything new appearing in this object must be a deliberate, reviewed addition.
    expect(Object.keys(input.metadata as object).sort()).toEqual(
      ["attempts", "backoffMs", "elapsedMs", "retried"].sort(),
    );
    expect(input.metadata).toMatchObject({ attempts: 1, retried: false });
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

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — a bounded internal retry must stay ONE governance record.
 *
 * The risk this pins down: a retry that quietly became "two requests" would double-count the user's
 * submission in `react_agent_audit_events` and make usage/incident analysis lie. The attempts are
 * therefore represented as safe METADATA on the single row, never as a second row.
 */
describe("workflow_guidance_intake — retry stays one logical request (REACT-AGENT-RETRY-BACKOFF-1)", () => {
  /** Fails the first call transiently (503), succeeds on the second. */
  function flakyThenOkFetch(): jest.MockedFunction<GatewayFetch> {
    let n = 0;
    return jest.fn<Promise<GatewayHttpResponse>, Parameters<GatewayFetch>>(async () => {
      n += 1;
      if (n === 1) {
        return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}), text: async () => "" };
      }
      const payload = envelope("recovered guidance");
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => payload, text: async () => JSON.stringify(payload) };
    });
  }

  /** No real waiting: injected clock/sleep/RNG. */
  const fastRetryDeps = {
    now: () => Date.now(),
    sleep: async (): Promise<"waited" | "cancelled"> => "waited",
    random: () => 0.5,
  };

  it("(#8) two attempts + one final success → exactly ONE audit row, outcome success", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    const fetchImpl = flakyThenOkFetch();
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "help" },
      { fetchImpl, auditRecorder, requestId: "logical-1", retryDeps: fastRetryDeps },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1); // ONE row for one user submission
    const row = record.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({ capabilityId: "workflow_guidance_intake", outcome: "success" });
    expect(row.metadata).toMatchObject({ attempts: 2, retried: true, retryReason: "status_503" });
  });

  it("(#8) the audit metadata carries counters and enums ONLY — no prompt, text, or token", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "SECRET-GOAL-TEXT about payroll" },
      { fetchImpl: flakyThenOkFetch(), auditRecorder, requestId: "logical-2", retryDeps: fastRetryDeps },
    );
    const row = record.mock.calls[0]![0] as Record<string, unknown>;
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("SECRET-GOAL-TEXT");
    expect(serialized).not.toContain("recovered guidance");
    expect(serialized).not.toContain(GATEWAY_TOKEN);
    // Only the documented safe keys.
    expect(Object.keys(row.metadata as object).sort()).toEqual(
      ["attempts", "backoffMs", "elapsedMs", "retried", "retryReason"].sort(),
    );
  });

  it("(#9-#14) retry exhaustion → still ONE audit row, outcome failed, reason carries the code", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    const always503 = jest.fn<Promise<GatewayHttpResponse>, Parameters<GatewayFetch>>(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "",
    }));
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "help" },
      { fetchImpl: always503, auditRecorder, requestId: "logical-3", retryDeps: fastRetryDeps },
    );

    expect(always503).toHaveBeenCalledTimes(2); // never a third
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(record).toHaveBeenCalledTimes(1);
    const row = record.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({ outcome: "failed", reason: "exec_failed:PROVIDER_ERROR" });
    expect(row.metadata).toMatchObject({ attempts: 2, retrySkippedReason: "attempts_exhausted" });
  });

  it("(#24,#26) a cancelled request makes no further attempt and records the cancellation once", async () => {
    enable();
    const { auditRecorder, record } = recorder();
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = okFetch(envelope("never reached"));
    const res = await runWorkflowGuidanceIntakeCapability(
      { scope: SCOPE, goalText: "help" },
      { fetchImpl, auditRecorder, requestId: "logical-4", signal: controller.signal, retryDeps: fastRetryDeps },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: false, code: "CANCELLED" });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0]).toMatchObject({ outcome: "failed", reason: "exec_failed:CANCELLED" });
  });
});
