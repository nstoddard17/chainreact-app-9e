/**
 * @jest-environment node
 *
 * Tests for POST /api/accounts/[id]/ai/workflow-guidance (HERMES-AGENT-CAPABILITY-ROUTE).
 *
 * Gate order: auth+membership+freeze -> strict body -> optional workflow ownership (no-leak 404) ->
 * Hermes availability (503, no charge) -> aiCreditGate (402/403/503) -> capability runner (audited).
 * The capability runner is mocked at the route boundary (its governance/audit/no-leak behavior is
 * covered in services/ai/reactAgent/capabilities/workflowGuidanceIntake.test.ts); this asserts the
 * route's auth/membership/billing/config gating, recorder injection, and safe response mapping.
 * No real network/model — everything is mocked.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockRequireUserWithAccount = jest.fn();
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
  loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
  workflowNotFoundResponse: () =>
    new Response(JSON.stringify({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json" } }),
  parseJsonBody: async (
    request: Request,
    schema: { safeParse: (v: unknown) => { success: true; data: unknown } | { success: false; error: { issues: { message: string }[] } } },
  ) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return { ok: false, response: new Response(JSON.stringify({ error: "Request body must be valid JSON." }), { status: 400, headers: { "content-type": "application/json" } }) };
    }
    const p = schema.safeParse(raw);
    return p.success
      ? { ok: true, data: p.data }
      : { ok: false, response: new Response(JSON.stringify({ error: p.error.issues[0]?.message ?? "Invalid." }), { status: 400, headers: { "content-type": "application/json" } }) };
  },
}));

const mockGate = jest.fn();
jest.mock("@/services/billing/aiCreditGate", () => ({ aiCreditGate: (...a: unknown[]) => mockGate(...a) }));

const mockEnabled = jest.fn();
const mockConfig = jest.fn();
jest.mock("@/services/ai-guidance/gateway/gatewayConfig", () => ({
  isHermesAgentEnabled: () => mockEnabled(),
  getHermesAgentGatewayConfig: () => mockConfig(),
}));

const mockAuditRecord = jest.fn();
jest.mock("@/services/ai/reactAgent/audit", () => ({ reactAgentAuditRecorder: { record: (...a: unknown[]) => mockAuditRecord(...a) } }));

const mockRunner = jest.fn();
jest.mock("@/services/ai/reactAgent/capabilities/workflowGuidanceIntake", () => ({
  runWorkflowGuidanceIntakeCapability: (...a: unknown[]) => mockRunner(...a),
}));

import { POST } from "@/app/api/accounts/[id]/ai/workflow-guidance/route";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";

const ACCOUNT = "acct-1";
const guidanceOk = { ok: true, guidanceText: "What app do your leads live in?", source: "hermes-agent", workflowPlan: null };
const wfRecord = { id: "wf-1", accountId: ACCOUNT, draftDefinition: { nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {} }], edges: [] } };

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/accounts/${id}/ai/workflow-guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}
const goodBody = { goalText: "I keep forgetting to follow up with leads" };

beforeEach(() => {
  mockRequireUserWithAccount.mockReset().mockResolvedValue({ ok: true, userId: "user-1", accountId: ACCOUNT });
  mockLoadWorkflowForMember.mockReset().mockResolvedValue({ ok: true, record: wfRecord });
  mockGate.mockReset().mockResolvedValue({ ok: true, skipped: true, reason: "enforcement_disabled" });
  mockEnabled.mockReset().mockReturnValue(true);
  mockConfig.mockReset().mockReturnValue({ gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 30000 });
  mockAuditRecord.mockReset().mockResolvedValue(undefined);
  mockRunner.mockReset().mockResolvedValue(guidanceOk);
});

describe("workflow-guidance route — auth + membership", () => {
  it("401 unauthenticated; never gates/runs", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserWithAccount.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(401);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("403 non-member account; never gates/runs", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserWithAccount.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }, { status: 403 }) });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(403);
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("resolves accountId from the URL param via requireUserWithAccount (never from body)", async () => {
    await call(ACCOUNT, { ...goodBody, accountId: "acct-EVIL" });
    // .strict() body rejects an unknown accountId field → 400 before anything; assert it never reached the gate with EVIL.
    expect(mockGate).not.toHaveBeenCalledWith(expect.objectContaining({ accountId: "acct-EVIL" }));
  });
});

describe("workflow-guidance route — body validation", () => {
  it("missing goalText → 400 before gate/runner", async () => {
    const res = await call(ACCOUNT, {});
    expect(res.status).toBe(400);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("a client-supplied accountId (unknown field) → 400 (.strict)", async () => {
    const res = await call(ACCOUNT, { goalText: "help", accountId: "acct-EVIL" });
    expect(res.status).toBe(400);
    expect(mockRunner).not.toHaveBeenCalled();
  });
});

describe("workflow-guidance route — optional workflow ownership", () => {
  it("workflow from another account → no-leak 404; never gates/runs", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: true, record: { ...wfRecord, accountId: "acct-OTHER" } });
    const res = await call(ACCOUNT, { ...goodBody, workflowId: "wf-1" });
    expect(res.status).toBe(404);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("non-member/missing workflow → 404 (loadWorkflowForMember not ok)", async () => {
    const { NextResponse } = await import("next/server");
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Workflow not found." }, { status: 404 }) });
    const res = await call(ACCOUNT, { ...goodBody, workflowId: "wf-x" });
    expect(res.status).toBe(404);
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("owned workflow → its draftDefinition is passed to the runner as safe context", async () => {
    await call(ACCOUNT, { ...goodBody, workflowId: "wf-1" });
    expect(mockRunner.mock.calls[0]![0]).toMatchObject({ definition: wfRecord.draftDefinition, scope: { workflowId: "wf-1" } });
  });
});

describe("workflow-guidance route — Hermes availability (no charge when unavailable)", () => {
  it("disabled → 503, NO gate, NO runner", async () => {
    mockEnabled.mockReturnValue(false);
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("GUIDANCE_UNAVAILABLE");
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("unconfigured (no gateway config) → 503, NO gate, NO runner", async () => {
    mockConfig.mockReturnValue(null);
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRunner).not.toHaveBeenCalled();
  });
});

describe("workflow-guidance route — billing gate before the capability", () => {
  it("gate called with the account + workflow_guidance/fast, BEFORE the runner", async () => {
    await call(ACCOUNT, goodBody);
    expect(mockGate).toHaveBeenCalledWith({ accountId: ACCOUNT, feature: "workflow_guidance", plannedTier: "fast" });
    expect(mockRunner).toHaveBeenCalledTimes(1);
  });

  it("insufficient credits → 402; runner NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 20, limit: 20 });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("gate error → 503; frozen → 403; runner NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "gate_error", used: 0, limit: 0 });
    expect((await call(ACCOUNT, goodBody)).status).toBe(503);
    mockGate.mockResolvedValueOnce({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    const frozen = await call(ACCOUNT, goodBody);
    expect(frozen.status).toBe(403);
    expect((await frozen.json()).code).toBe("ACCOUNT_PENDING_DELETION");
    expect(mockRunner).not.toHaveBeenCalled();
  });
});

describe("workflow-guidance route — capability call + safe response", () => {
  it("gate passes → runs capability with scope+goalText and INJECTS the persistent audit recorder", async () => {
    await call(ACCOUNT, goodBody);
    const [input, deps] = mockRunner.mock.calls[0]!;
    expect(input).toMatchObject({ scope: { userId: "user-1", accountId: ACCOUNT }, goalText: goodBody.goalText });
    expect(deps).toEqual({ auditRecorder: reactAgentAuditRecorder });
  });

  it("success → 200 with guidanceText/source/workflowPlan ONLY (no raw envelope/usage/prompt/secret)", async () => {
    mockRunner.mockResolvedValueOnce({ ok: true, guidanceText: "Ask: which app?", source: "hermes-agent", workflowPlan: null, rawUsage: { promptTokens: 10 }, warnings: ["multiple_choices_truncated"] });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, guidanceText: "Ask: which app?", source: "hermes-agent", workflowPlan: null, warnings: ["multiple_choices_truncated"] });
    // rawUsage is dropped from the route response; no prompt / ids / gateway token leak.
    // (`warnings` is a safe enum and IS returned — so don't assert against generic substrings
    //  like "choices" that legitimately appear inside `multiple_choices_truncated`.)
    expect(body).not.toHaveProperty("rawUsage");
    const s = JSON.stringify(body);
    for (const needle of ["promptTokens", "gatewayToken", "tok", ACCOUNT, "I keep forgetting"]) {
      expect(s).not.toContain(needle);
    }
  });

  it("success WITH a validated workflowPlan → 200 returns the plan + warnings (advisory, no mutation)", async () => {
    const plan = {
      schemaVersion: 1,
      title: "Lead follow-up",
      summary: "Watch then notify.",
      notApplied: true,
      steps: [{ ref: "s0", role: "action", provider: "slack", type: "send_message", purpose: "notify" }],
    };
    mockRunner.mockResolvedValueOnce({ ok: true, guidanceText: "Here's a plan.", source: "hermes-agent", workflowPlan: plan, warnings: ["Suggested plan could not be validated."] });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, guidanceText: "Here's a plan.", source: "hermes-agent", workflowPlan: plan, warnings: ["Suggested plan could not be validated."] });
    expect(body.workflowPlan.notApplied).toBe(true);
  });

  it("runner provider failure → 503 GUIDANCE_UNAVAILABLE; never leaks raw error", async () => {
    mockRunner.mockResolvedValueOnce({ ok: false, code: "PROVIDER_ERROR", message: "downstream SECRET detail" });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "GUIDANCE_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
});

describe("workflow-guidance route — server-only / no forbidden surface (static)", () => {
  it("the route source goes through the runner, not the gateway client, and has no mutation/model/secret", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/accounts/[id]/ai/workflow-guidance/route.ts"), "utf8");
    const forbidden = [
      /gateway\/hermesAgentGatewayClient/, // must call the runner, not the gateway client directly
      /requestHermesAgentGuidance/, // ditto
      /saveDraftDefinition|updateWorkflow|applyWorkflowPatch|activateWorkflow|deleteWorkflow|createWorkflow/, // mutation
      /nousresearch|inference-api\.nousresearch/i,
      /["'`][^"'`]*chat\/completions/,
      /new OpenAI\b|api\.openai\.com|@\/services\/ai\/modelClients/,
      /process\.env(\.|\[\s*["'])\s*(OPENAI_API_KEY|API_SERVER_KEY|HERMES_AGENT_INTERNAL_TOKEN|HERMES_AGENT_PRIVATE_URL)/,
      /^\s*["']use client["']/m, // route handlers are server-only
    ];
    for (const pat of forbidden) expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
  });
});
