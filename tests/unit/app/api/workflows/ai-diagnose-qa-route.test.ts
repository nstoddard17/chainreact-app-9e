/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/diagnose/qa (Slice 4.AI-DIAG-QA-2).
 *
 * Mirrors the explain-route contract: auth → validate question/draft → re-derive DTO
 * server-side (never trust client DTO) → access wall → OpenAI-config 503 → credit gate
 * BEFORE model (feature `workflow_qa`, fast) → answer → fail-open telemetry. Adds the
 * Q&A specifics: question validation (empty/too long), bogus selectedNodeId ignored +
 * never echoed, telemetry recorded under DB-valid `other` + metadata kind
 * `workflow_diagnosis_qa`. No real model/network — service mocked.
 */
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

const mockAnswer = jest.fn();
jest.mock("@/services/ai/diagnostics/answerWorkflowQuestion", () => ({
  answerWorkflowQuestion: (...a: unknown[]) => mockAnswer(...a),
  MAX_QUESTION_LENGTH: 500,
}));

const mockBuildSelected = jest.fn();
jest.mock("@/services/ai/diagnostics/buildDiagnosisQaContext", () => ({
  buildSelectedNodeDataSummary: (...a: unknown[]) => mockBuildSelected(...a),
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

import { POST } from "@/app/api/workflows/[id]/ai/diagnose/qa/route";

const okDto = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "Gmail isn't connected.",
  findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", provider: "gmail" }],
};
const answerOk = {
  ok: true,
  answer: "Reconnect Gmail to run this workflow.",
  pointers: ["Reconnect Gmail in Apps"],
  needsUserDecision: false,
  model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 10, outputTokens: 20 }, latencyMs: 5 },
};
const record = {
  id: "wf-1",
  accountId: "acct-wf-1",
  draftDefinition: { nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {} }], edges: [] },
};

function callBody(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/diagnose/qa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}
/** Default valid call: a question + a malicious client DTO/accountId the route must ignore. */
function call(id: string) {
  return callBody(id, { question: "Why won't this run?", dto: { access: "OK", findings: [{ title: "INJECTED" }] }, accountId: "acct-EVIL" });
}

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  mockRequireUser.mockReset();
  mockRequireUser.mockResolvedValue({ ok: true, userId: "user-1" });
  mockLoadWorkflowForMember.mockReset();
  mockLoadWorkflowForMember.mockResolvedValue({ ok: true, record });
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(okDto);
  mockAnswer.mockReset();
  mockAnswer.mockResolvedValue(answerOk);
  mockBuildSelected.mockReset();
  mockBuildSelected.mockReturnValue(undefined);
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

describe("ai/diagnose/qa — auth + question validation", () => {
  it("401 unauthenticated; never diagnoses/gates/answers", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUser.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("missing question → 400 before diagnose/gate/model", async () => {
    const res = await callBody("wf-1", {});
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("empty/whitespace question → 400", async () => {
    expect((await callBody("wf-1", { question: "   " })).status).toBe(400);
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("over-long question (>500) → 400 before diagnose/gate/model", async () => {
    const res = await callBody("wf-1", { question: "a".repeat(501) });
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("non-member/missing workflow → no-leak 404 BEFORE diagnose/gate/model", async () => {
    const { NextResponse } = await import("next/server");
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Workflow not found." }, { status: 404 }) });
    const res = await call("wf-forbidden");
    expect(res.status).toBe(404);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/qa — re-derive + access wall + malicious DTO", () => {
  it("re-derives the DTO server-side; ignores a client-posted DTO/accountId; bills the workflow account", async () => {
    await call("wf-1");
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ dto: okDto, question: "Why won't this run?", tier: "fast" }),
    );
    const gateArg = mockGate.mock.calls[0]![0];
    expect(gateArg.accountId).toBe("acct-wf-1");
    expect(gateArg.accountId).not.toBe("acct-EVIL");
  });

  it("access wall (NO_ACCESS) → returns safe DTO, NO gate, NO model", async () => {
    mockDiagnose.mockResolvedValueOnce({ workflowId: "wf-x", access: "NO_ACCESS" });
    const res = await call("wf-x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflowId: "wf-x", access: "NO_ACCESS" });
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it("INVALID draftDefinition → 400 BEFORE diagnose/gate/model", async () => {
    const dup = { id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } };
    const res = await callBody("wf-1", { question: "hi", draftDefinition: { nodes: [dup, { ...dup }], edges: [] } });
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/qa — OpenAI config gate (no charge when unconfigured)", () => {
  it("provider disabled → 503, NO gate, NO model", async () => {
    mockProviderEnabled.mockReturnValue(false);
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("MODEL_FAILED");
  });

  it("missing API key → 503, NO gate, NO model", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose/qa — credit gate before the model call", () => {
  it("gate called with the workflow account + workflow_qa/fast, BEFORE the model", async () => {
    await call("wf-1");
    expect(mockGate).toHaveBeenCalledWith({ accountId: "acct-wf-1", feature: "workflow_qa", plannedTier: "fast" });
    expect(mockAnswer).toHaveBeenCalledTimes(1);
  });

  it("insufficient credits → 402 AI_CREDITS_EXHAUSTED; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 20, limit: 20 });
    const res = await call("wf-1");
    expect(res.status).toBe(402);
    expect(mockAnswer).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
  });

  it("gate error → 503 AI_GATE_ERROR; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "gate_error", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockAnswer).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("AI_GATE_ERROR");
  });

  it("frozen account → 403 ACCOUNT_PENDING_DELETION; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(403);
    expect(mockAnswer).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});

describe("ai/diagnose/qa — selected node + success + telemetry + no-leak", () => {
  it("success → 200 {ok:true, answer, pointers, needsUserDecision}; records completed event under 'other' + qa kind on the workflow account", async () => {
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, answer: answerOk.answer, pointers: ["Reconnect Gmail in Apps"], needsUserDecision: false });
    expect(mockRecCompleted).toHaveBeenCalledTimes(1);
    const [scope, callInput] = mockRecCompleted.mock.calls[0]!;
    // DB-valid feature 'other' (no migration for workflow_qa); attribution via metadata kind.
    expect(scope).toMatchObject({ accountId: "acct-wf-1", userId: "user-1", feature: "other", workflowId: "wf-1" });
    expect(callInput).toMatchObject({ aiCreditsCharged: 1, modelProvider: "openai" });
    expect(callInput.metadata).toMatchObject({ kind: "workflow_diagnosis_qa", chargeFeature: "workflow_qa" });
  });

  it("a VALID selected-node summary is forwarded to the answerer", async () => {
    mockBuildSelected.mockReturnValueOnce({ available: [{ path: "message.text", type: "string", sensitive: false }], truncated: false });
    await callBody("wf-1", { question: "what data is here?", selectedNodeId: "n1" });
    expect(mockBuildSelected).toHaveBeenCalledWith(record.draftDefinition, "n1");
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ selectedNode: { available: [{ path: "message.text", type: "string", sensitive: false }], truncated: false } }),
    );
  });

  it("bogus selectedNodeId (summary undefined) is ignored, not forwarded, and never echoed", async () => {
    mockBuildSelected.mockReturnValueOnce(undefined);
    const res = await callBody("wf-1", { question: "explain", selectedNodeId: "ghost-node-SECRET" });
    expect(res.status).toBe(200);
    // Not forwarded to the model orchestrator.
    expect(mockAnswer.mock.calls[0]![0]).not.toHaveProperty("selectedNode");
    // Never echoed in the response.
    expect(JSON.stringify(await res.json())).not.toContain("ghost-node-SECRET");
  });

  it("model failure → 503 {ok:false, MODEL_FAILED}; records failed event; no raw error leak", async () => {
    mockAnswer.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "MODEL_FAILED" });
    expect(JSON.stringify(body)).not.toContain("SECRET-INTERNAL");
    expect(mockRecFailed).toHaveBeenCalledTimes(1);
  });

  it("a recording failure NEVER breaks the response (fail-open)", async () => {
    mockRecCompleted.mockRejectedValueOnce(new Error("ledger down"));
    expect((await call("wf-1")).status).toBe(200);
  });

  it("response leaks no account id / model-internal / secret substrings", async () => {
    const res = await call("wf-1");
    const s = JSON.stringify(await res.json());
    for (const needle of ["acct-wf-1", "gpt-4.1-mini", "inputTokens", "OPENAI_API_KEY", "ya29.", "sk-"]) {
      expect(s).not.toContain(needle);
    }
  });
});
