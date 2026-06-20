/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/repair/plan (Slice 4.AI-REPAIR-1b).
 *
 * Mirrors the explain-route suite. Auth/diagnosis/gate/service/model-factory/
 * recorders are mocked so the route's authz / re-derive / gate-before-model /
 * denial-mapping / billing-account / no-leak / proposal-only contract is isolated.
 * No real model/network. Proposal-only — the route never applies/saves/runs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const mockRepair = jest.fn();
jest.mock("@/services/ai/repair/planWorkflowRepair", () => ({
  planWorkflowRepair: (...a: unknown[]) => mockRepair(...a),
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

// REACT-AGENT-CS-6 — capture the injected audit recorder (the real seam runs unmocked).
const mockAuditRecord = jest.fn();
jest.mock("@/services/ai/reactAgent/audit", () => ({
  reactAgentAuditRecorder: { record: (...a: unknown[]) => mockAuditRecord(...a) },
}));

import { POST } from "@/app/api/workflows/[id]/ai/repair/plan/route";

function call(id: string) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A malicious client tries to inject a fake DTO + account — the route must ignore both.
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

const repairOk = {
  ok: true,
  proposal: {
    summary: "Gmail is disconnected — reconnect it, then re-check.",
    recommendedActions: ["Reconnect Gmail"],
    affectedNodes: ["Gmail — Send Email"],
    missingInfo: [],
    riskLevel: "low",
    canAutoPatchLater: false,
    requiresUserAction: true,
    notAppliedNotice: "This is a suggestion only — your workflow wasn't changed, saved, or run.",
  },
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
  mockRepair.mockReset();
  mockRepair.mockResolvedValue(repairOk);
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
  mockAuditRecord.mockReset();
  mockAuditRecord.mockResolvedValue(undefined);
  process.env.OPENAI_API_KEY = "test-openai-key";
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("ai/repair/plan — auth + authz", () => {
  it("401 unauthenticated; never diagnoses/gates/proposes", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUser.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
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
    expect(mockRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/plan — re-derive + access wall", () => {
  it("re-derives the DTO server-side from the SESSION user; ignores any client-posted DTO/accountId", async () => {
    await call("wf-1");
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
    expect(mockRepair).toHaveBeenCalledWith(expect.objectContaining({ dto: okDto, tier: "fast" }));
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
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("access wall (NOT_FOUND) → returns the safe DTO, NO gate, NO model", async () => {
    mockDiagnose.mockResolvedValueOnce({ workflowId: "wf-x", access: "NOT_FOUND" });
    const res = await call("wf-x");
    expect(res.status).toBe(200);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/plan — OpenAI config gate (no charge when unconfigured)", () => {
  it("provider disabled → 503, NO credit gate, NO model", async () => {
    mockProviderEnabled.mockReturnValue(false);
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("MODEL_FAILED");
  });

  it("missing API key → 503, NO credit gate, NO model", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/plan — credit gate before the model call", () => {
  it("gate called with the workflow account + workflow_repair/fast, BEFORE the model", async () => {
    await call("wf-1");
    expect(mockGate).toHaveBeenCalledWith({
      accountId: "acct-wf-1",
      feature: "workflow_repair",
      plannedTier: "fast",
    });
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });

  it("insufficient credits → 402 AI_CREDITS_EXHAUSTED; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 40, limit: 40 });
    const res = await call("wf-1");
    expect(res.status).toBe(402);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
  });

  it("gate error → 503 AI_GATE_ERROR; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "gate_error", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("AI_GATE_ERROR");
  });

  it("frozen account → 403 ACCOUNT_PENDING_DELETION; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(403);
    expect(mockRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});

describe("ai/repair/plan — success + failure + recording", () => {
  it("success → 200 {ok:true, proposal} and records a completed event (workflow_repair, 4 credits) on the workflow account", async () => {
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, proposal: { summary: repairOk.proposal.summary, riskLevel: "low" } });
    // Proposal carries the immutable "not changed" notice.
    expect(body.proposal.notAppliedNotice).toMatch(/wasn't changed, saved, or run/);
    expect(mockRecCompleted).toHaveBeenCalledTimes(1);
    const [scope, callInput] = mockRecCompleted.mock.calls[0]!;
    expect(scope).toMatchObject({ accountId: "acct-wf-1", userId: "user-1", feature: "workflow_repair", workflowId: "wf-1" });
    expect(callInput).toMatchObject({ aiCreditsCharged: 4, modelProvider: "openai" });
  });

  it("the success response never claims anything was applied/saved/run/fixed", async () => {
    const res = await call("wf-1");
    const s = JSON.stringify(await res.json()).toLowerCase();
    // No assertion-of-completion verbs (the only allowed mention is the negated notApplied notice).
    expect(s).not.toMatch(/\b(applied|saved the workflow|has been (changed|fixed|repaired|run))\b/);
    expect(s).toContain("suggestion only");
  });

  it("model failure → 503 {ok:false, MODEL_FAILED} and records a failed event; no raw error leak", async () => {
    mockRepair.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
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

// ── AI-DIAG-FIX-1: current-builder-draft snapshot (Suggest re-derives current state) ──
const validDraft = {
  nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
};
function callBody(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("ai/repair/plan — current draft override", () => {
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
    expect(mockRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/plan — React Agent audit emission (CS-6)", () => {
  it("success → emits ONE react_agent.repair_proposal row, mode proposes_change, on the workflow scope", async () => {
    await call("wf-1");
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    expect(mockAuditRecord.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-wf-1",
      actorUserId: "user-1",
      workflowId: "wf-1",
      capabilityId: "repair_proposal",
      intent: "propose_repair",
      mode: "proposes_change",
      creditFeature: "workflow_repair",
      auditKind: "react_agent.repair_proposal",
      outcome: "success",
    });
  });

  it("attaches no metadata at the seam (no raw proposal body leaks into audit)", async () => {
    await call("wf-1");
    const input = mockAuditRecord.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).not.toHaveProperty("metadata");
    expect(JSON.stringify(input)).not.toContain(repairOk.proposal.summary);
  });

  it("model failure → emits a `failed` audit row (response unchanged: 503 MODEL_FAILED)", async () => {
    mockRepair.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockAuditRecord.mock.calls[0]![0]).toMatchObject({ capabilityId: "repair_proposal", outcome: "failed" });
  });

  it("an audit recorder failure NEVER breaks the response (fail-open) — still 200", async () => {
    mockAuditRecord.mockRejectedValueOnce(new Error("audit ledger down"));
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, proposal: { summary: repairOk.proposal.summary } });
  });

  it("does NOT emit audit when the gate denies (402 → no audit row)", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 40, limit: 40 });
    const res = await call("wf-1");
    expect(res.status).toBe(402);
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });
});

describe("ai/repair/plan — boundaries (proposal-only)", () => {
  it("the route imports no MCP, no apply/patch writers, and triggers no save/run", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/repair/plan/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/scripts\/mcp|@\/scripts\/mcp/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatch|applyPatchToDefinition|validateWorkflowPatch/);
    expect(src).not.toMatch(/updateDraftDefinition|saveWorkflow|executeWorkflow|runWorkflow/);
    expect(src).not.toMatch(/hermes/i);
  });
});
