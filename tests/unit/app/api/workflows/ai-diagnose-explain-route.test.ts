/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/diagnose/explain (Slice 4.AI-DIAG-2a).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the diagnosis,
 * gate, explainer service, model-client factory, and recorders are mocked so the
 * route's authz / re-derive / gate-before-model / denial-mapping / billing-account /
 * no-leak contract is isolated. No real model/network.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Fully mock `_shared` (requireUser + loadWorkflowForMember) — both are exercised
// by this route. A full mock (vs requireActual) keeps the suite independent of the
// real `_shared`'s heavy transitive imports (repositories / contracts), which the
// parallel Apps/connection-sharing track may leave mid-edit.
const mockRequireUser = jest.fn();
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUser: (...a: unknown[]) => mockRequireUser(...a),
  loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
}));

const mockDiagnose = jest.fn();
jest.mock("@/services/ai/diagnostics/diagnoseWorkflowForAgent", () => ({
  diagnoseWorkflowForAgent: (...a: unknown[]) => mockDiagnose(...a),
}));

const mockExplain = jest.fn();
jest.mock("@/services/ai/diagnostics/explainWorkflowDiagnosis", () => ({
  explainWorkflowDiagnosis: (...a: unknown[]) => mockExplain(...a),
}));

const mockGate = jest.fn();
jest.mock("@/services/billing/aiCreditGate", () => ({
  aiCreditGate: (...a: unknown[]) => mockGate(...a),
}));

const mockRecCompleted = jest.fn();
const mockRecFailed = jest.fn();
jest.mock("@/services/billing/aiCostEvents", () => ({
  recordAiModelCallCompleted: (...a: unknown[]) => mockRecCompleted(...a),
  recordAiModelCallFailed: (...a: unknown[]) => mockRecFailed(...a),
}));

const mockProviderEnabled = jest.fn();
const mockCreateClient = jest.fn();
jest.mock("@/services/ai/modelClients/createModelClient", () => ({
  isOpenAiProviderEnabled: () => mockProviderEnabled(),
  createModelClientForModel: (...a: unknown[]) => mockCreateClient(...a),
}));

import { POST } from "@/app/api/workflows/[id]/ai/diagnose/explain/route";

function call(id: string) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/diagnose/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A malicious client tries to inject a fake DTO — the route must ignore it.
      body: JSON.stringify({ dto: { access: "OK", findings: [{ title: "INJECTED" }] }, accountId: "acct-EVIL" }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const okDto = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "Gmail isn't connected.",
  nextSteps: ["Reconnect Gmail."],
  findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", provider: "gmail" }],
};

const explainOk = {
  ok: true,
  explanation: "Gmail is disconnected — reconnect it to run this workflow.",
  priorities: ["Reconnect Gmail"],
  model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 10, outputTokens: 20 }, latencyMs: 5 },
};

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  mockRequireUser.mockReset();
  mockRequireUser.mockResolvedValue({ ok: true, userId: "user-1" });
  mockLoadWorkflowForMember.mockReset();
  mockLoadWorkflowForMember.mockResolvedValue({ ok: true, record: { id: "wf-1", accountId: "acct-wf-1" } });
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(okDto);
  mockExplain.mockReset();
  mockExplain.mockResolvedValue(explainOk);
  mockGate.mockReset();
  mockGate.mockResolvedValue({ ok: true, skipped: true, reason: "enforcement_disabled" });
  mockRecCompleted.mockReset();
  mockRecCompleted.mockResolvedValue(undefined);
  mockRecFailed.mockReset();
  mockRecFailed.mockResolvedValue(undefined);
  mockProviderEnabled.mockReset();
  mockProviderEnabled.mockReturnValue(true);
  mockCreateClient.mockReset();
  mockCreateClient.mockReturnValue({ generateStructuredJson: jest.fn() });
  process.env.OPENAI_API_KEY = "test-openai-key";
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("ai/diagnose/explain — auth + authz", () => {
  it("401 unauthenticated; never diagnoses/gates/explains", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it("non-member/missing workflow → no-leak 404 BEFORE diagnose/gate/model", async () => {
    const { NextResponse } = await import("next/server");
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }, { status: 404 }),
    });
    const res = await call("wf-forbidden");
    expect(res.status).toBe(404);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/explain — re-derive + access wall", () => {
  it("re-derives the DTO server-side from the SESSION user; ignores any client-posted DTO/accountId", async () => {
    await call("wf-1");
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
    // The explainer is handed the SERVER-derived dto, not the client's injected one.
    expect(mockExplain).toHaveBeenCalledWith(
      expect.objectContaining({ dto: okDto, tier: "fast" }),
    );
    // Gate billed the workflow-owning account, never the client's "acct-EVIL".
    const gateArg = mockGate.mock.calls[0]![0];
    expect(gateArg.accountId).toBe("acct-wf-1");
    expect(gateArg.accountId).not.toBe("acct-EVIL");
  });

  it("access wall (NO_ACCESS) → returns the safe DTO, NO gate, NO model", async () => {
    mockDiagnose.mockResolvedValueOnce({ workflowId: "wf-x", access: "NO_ACCESS" });
    const res = await call("wf-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflowId: "wf-x", access: "NO_ACCESS" });
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/explain — OpenAI config gate (no charge when unconfigured)", () => {
  it("provider disabled → 503, NO credit gate, NO model", async () => {
    mockProviderEnabled.mockReturnValue(false);
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("MODEL_FAILED");
  });

  it("missing API key → 503, NO credit gate, NO model", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/explain — credit gate before the model call", () => {
  it("gate called with the workflow account + workflow_explanation/fast, BEFORE the model", async () => {
    await call("wf-1");
    expect(mockGate).toHaveBeenCalledWith({
      accountId: "acct-wf-1",
      feature: "workflow_explanation",
      plannedTier: "fast",
    });
    expect(mockExplain).toHaveBeenCalledTimes(1);
  });

  it("insufficient credits → 402 AI_CREDITS_EXHAUSTED; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 20, limit: 20 });
    const res = await call("wf-1");
    expect(res.status).toBe(402);
    expect(mockExplain).not.toHaveBeenCalled();
    expect((await res.json())).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
  });

  it("gate error → 503 AI_GATE_ERROR; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "gate_error", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockExplain).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("AI_GATE_ERROR");
  });

  it("frozen account → 403 ACCOUNT_PENDING_DELETION; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(403);
    expect(mockExplain).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});

describe("ai/diagnose/explain — success + failure + recording", () => {
  it("success → 200 {ok:true, explanation,...} and records a completed event on the workflow account", async () => {
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, explanation: explainOk.explanation, priorities: ["Reconnect Gmail"] });
    expect(mockRecCompleted).toHaveBeenCalledTimes(1);
    const [scope, callInput] = mockRecCompleted.mock.calls[0]!;
    expect(scope).toMatchObject({ accountId: "acct-wf-1", userId: "user-1", feature: "workflow_explanation", workflowId: "wf-1" });
    expect(callInput).toMatchObject({ aiCreditsCharged: 1, modelProvider: "openai" });
  });

  it("model failure → 503 {ok:false, MODEL_FAILED} and records a failed event; no raw error leak", async () => {
    mockExplain.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "MODEL_FAILED" });
    expect(JSON.stringify(body)).not.toContain("SECRET-INTERNAL");
    expect(mockRecFailed).toHaveBeenCalledTimes(1);
  });

  it("a recording failure NEVER breaks the response (fail-open)", async () => {
    mockRecCompleted.mockRejectedValueOnce(new Error("ledger down"));
    const res = await call("wf-1");
    expect(res.status).toBe(200);
  });

  it("response leaks no secret/model-internal substrings", async () => {
    const res = await call("wf-1");
    const s = JSON.stringify(await res.json());
    for (const needle of ["acct-wf-1", "gpt-4.1-mini", "inputTokens", "OPENAI_API_KEY", "ya29.", "sk-"]) {
      expect(s).not.toContain(needle);
    }
  });
});

// ── AI-DIAG-FIX-1: current-builder-draft snapshot (Explain re-derives current state) ──
const validDraft = {
  nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
};
function callBody(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/diagnose/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("ai/diagnose/explain — current draft override", () => {
  it("forwards a VALID draftDefinition to the server-side re-derivation", async () => {
    await callBody("wf-1", { draftDefinition: validDraft });
    expect(mockDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectUserId: "user-1",
        workflowId: "wf-1",
        draftOverride: expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ id: "n1" })]),
        }),
      }),
    );
  });

  it("INVALID draftDefinition → 400 BEFORE diagnose / gate / model", async () => {
    const res = await callBody("wf-1", {
      draftDefinition: { nodes: [validDraft.nodes[0], { ...validDraft.nodes[0], id: "n2" }], edges: [] },
    });
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/explain — boundaries", () => {
  it("the route imports no MCP and no apply/repo writers", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/diagnose/explain/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/scripts\/mcp|@\/scripts\/mcp/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/updateDraftDefinition|applyWorkflowPatch/);
  });
});
