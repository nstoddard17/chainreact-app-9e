/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/repair/preview (Slice 4.AI-REPAIR-2b).
 *
 * Mirrors the repair/plan-route suite. Auth/diagnosis/gate/service/model-factory/
 * recorders are mocked so the route's authz / re-derive / gate-before-model /
 * denial-mapping / billing-account / no-leak / preview-only contract is isolated.
 * No real model/network. Preview-only — the route never applies/saves/runs.
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

const mockPreviewRepair = jest.fn();
const mockHasRepairable = jest.fn();
jest.mock("@/services/ai/repair/previewWorkflowRepair", () => ({
  previewWorkflowRepair: (...a: unknown[]) => mockPreviewRepair(...a),
  diagnosisHasRepairableIssue: (...a: unknown[]) => mockHasRepairable(...a),
  REPAIR_PREVIEW_NOT_APPLIED_NOTICE: "This is a preview only — your workflow wasn't changed, saved, or run.",
}));

// AI-REPAIR-3H — the deterministic (free, model-free) preview lives in its own module.
const mockRunDeterministic = jest.fn();
jest.mock("@/services/ai/repair/deterministicRepairPreview", () => ({
  runDeterministicRepairPreview: (...a: unknown[]) => mockRunDeterministic(...a),
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

import { POST } from "@/app/api/workflows/[id]/ai/repair/preview/route";

function call(id: string) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A malicious client tries to inject a fake DTO + account — the route must ignore both.
      body: JSON.stringify({ dto: { access: "OK", findings: [{ title: "INJECTED" }] }, accountId: "acct-EVIL" }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function callBody(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/repair/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const okDto = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "The Gmail step is missing its recipient.",
  nextSteps: ["Set the recipient."],
  findings: [{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", provider: "gmail" }],
};

const previewOk = {
  ok: true,
  preview: {
    ok: true,
    patchSummary: "Set the recipient on the Gmail step.",
    changes: [{ op: "updateNodeConfig", description: 'Updates configuration for "Gmail — Send Email" (fields: to).', nodeId: "node-B", fields: ["to"] }],
    affectedNodeIds: ["node-B"],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [] },
    userFacingSummaryText: "Set the recipient — 1 change(s). Risk: low.",
    canApplyLater: true,
  },
  model: { modelId: "gpt-4.1-mini", tier: "fast", usage: { inputTokens: 12, outputTokens: 40 }, latencyMs: 7 },
};

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  mockRequireUser.mockReset();
  mockRequireUser.mockResolvedValue({ ok: true, userId: "user-1" });
  mockLoadWorkflowForMember.mockReset();
  mockLoadWorkflowForMember.mockResolvedValue({ ok: true, record: { id: "wf-1", accountId: "acct-wf-1" } });
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(okDto);
  mockPreviewRepair.mockReset();
  mockPreviewRepair.mockResolvedValue(previewOk);
  mockHasRepairable.mockReset();
  mockHasRepairable.mockReturnValue(true); // default: the re-derived diagnosis still has an issue
  mockRunDeterministic.mockReset();
  mockRunDeterministic.mockResolvedValue(null); // default: no deterministic repair → model path
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

describe("ai/repair/preview — auth + authz", () => {
  it("401 unauthenticated; never diagnoses/gates/previews", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUser.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });

  it("non-member/missing workflow → no-leak 404 BEFORE diagnose/gate/model", async () => {
    const { NextResponse } = await import("next/server");
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Workflow not found." }, { status: 404 }) });
    const res = await call("wf-forbidden");
    expect(res.status).toBe(404);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/preview — re-derive + access wall", () => {
  it("re-derives the DTO from the SESSION user; ignores any client-posted DTO/accountId; bills the workflow account", async () => {
    await call("wf-1");
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
    expect(mockPreviewRepair).toHaveBeenCalledWith(expect.objectContaining({ dto: okDto, userId: "user-1", workflowId: "wf-1", tier: "fast" }));
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
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });

  it("access wall (NOT_FOUND) → returns the safe DTO, NO gate, NO model", async () => {
    mockDiagnose.mockResolvedValueOnce({ workflowId: "wf-x", access: "NOT_FOUND" });
    const res = await call("wf-x");
    expect(res.status).toBe(200);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/preview — OpenAI config gate (no charge when unconfigured)", () => {
  it("provider disabled → 503, NO credit gate, NO model", async () => {
    mockProviderEnabled.mockReturnValue(false);
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("MODEL_FAILED");
  });

  it("missing API key → 503, NO credit gate, NO model", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/preview — credit gate before the model call", () => {
  it("gate called with the workflow account + workflow_repair/fast, BEFORE the model", async () => {
    await call("wf-1");
    expect(mockGate).toHaveBeenCalledWith({ accountId: "acct-wf-1", feature: "workflow_repair", plannedTier: "fast" });
    expect(mockPreviewRepair).toHaveBeenCalledTimes(1);
  });

  it("insufficient credits → 402 AI_CREDITS_EXHAUSTED; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "insufficient_ai_credits", used: 40, limit: 40 });
    const res = await call("wf-1");
    expect(res.status).toBe(402);
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
  });

  it("gate error → 503 AI_GATE_ERROR; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "gate_error", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("AI_GATE_ERROR");
  });

  it("frozen account → 403 ACCOUNT_PENDING_DELETION; model NOT called", async () => {
    mockGate.mockResolvedValueOnce({ ok: false, reason: "account_frozen", used: 0, limit: 0 });
    const res = await call("wf-1");
    expect(res.status).toBe(403);
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});

describe("ai/repair/preview — success + failure + recording", () => {
  it("success → 200 {ok:true, preview, notAppliedNotice} and records a completed event (workflow_repair, 4 credits) on the workflow account", async () => {
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, preview: { ok: true, riskLevel: "low" } });
    expect(body.notAppliedNotice).toMatch(/preview only/i);
    expect(body.notAppliedNotice).toMatch(/wasn't changed, saved, or run/);
    expect(mockRecCompleted).toHaveBeenCalledTimes(1);
    const [scope, callInput] = mockRecCompleted.mock.calls[0]!;
    expect(scope).toMatchObject({ accountId: "acct-wf-1", userId: "user-1", feature: "workflow_repair", workflowId: "wf-1" });
    expect(callInput).toMatchObject({ aiCreditsCharged: 4, modelProvider: "openai" });
    expect(callInput.metadata).toMatchObject({ kind: "workflow_repair_preview" });
  });

  it("a validation-blocked preview is still a 200 (preview.ok=false, blockedReason) — no apply enabled", async () => {
    mockPreviewRepair.mockResolvedValueOnce({
      ok: true,
      preview: { ...previewOk.preview, ok: false, canApplyLater: false, blockedReason: "references a node that's no longer in this workflow", validation: { ok: false, errors: [{ code: "UNKNOWN_NODE", message: "x" }], warnings: [] } },
      model: previewOk.model,
    });
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.preview.ok).toBe(false);
    expect(body.preview.canApplyLater).toBe(false);
    expect(body.preview.blockedReason).toContain("no longer in this workflow");
  });

  it("the success response never claims anything was applied/saved/run", async () => {
    const res = await call("wf-1");
    const s = JSON.stringify(await res.json()).toLowerCase();
    expect(s).not.toMatch(/\b(was applied|saved the workflow|has been (changed|fixed|repaired|run))\b/);
    expect(s).toContain("preview only");
  });

  it("model/parse failure → 503 {ok:false, MODEL_FAILED} and records a failed event; no raw error leak", async () => {
    mockPreviewRepair.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "MODEL_FAILED" });
    expect(JSON.stringify(body)).not.toContain("SECRET-INTERNAL");
    expect(mockRecFailed).toHaveBeenCalledTimes(1);
  });

  it("GRAPH_UNAVAILABLE → 500 (defensive), records a failed event", async () => {
    mockPreviewRepair.mockResolvedValueOnce({ ok: false, code: "GRAPH_UNAVAILABLE", message: "x", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("GRAPH_UNAVAILABLE");
    expect(mockRecFailed).toHaveBeenCalledTimes(1);
  });

  // AI-REPAIR-2D — expected stale/resolved/declined states must NOT map to 503.
  it("NOTHING_TO_PREVIEW: a re-derived diagnosis with nothing to repair → 200 handled, NO gate/model/charge/503", async () => {
    mockHasRepairable.mockReturnValueOnce(false); // user already fixed the issue the proposal was based on
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "NOTHING_TO_PREVIEW" });
    expect(body.message).toMatch(/run check workflow again/i);
    // No charge, no model, no recording — it short-circuits before all of them.
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect(mockRecCompleted).not.toHaveBeenCalled();
    expect(mockRecFailed).not.toHaveBeenCalled();
  });

  it("NO_SAFE_PATCH (model declined to auto-patch) → 200 handled, NOT a 503", async () => {
    mockPreviewRepair.mockResolvedValueOnce({ ok: false, code: "NO_SAFE_PATCH", message: "declined", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "NO_SAFE_PATCH" });
    expect(body.message).toMatch(/safe automatic fix/i);
  });

  it("AI-REPAIR-2E — malformed model output (NO_SAFE_PATCH + detail) → 200 handled, NOT 503, detail recorded in telemetry", async () => {
    // The model responded but its patch was unusable; the service reclassifies to
    // NO_SAFE_PATCH (never PARSE_FAILED→503). The route returns the friendly 200 and
    // records the failed event with the safe sub-reason `detail` for observability.
    mockPreviewRepair.mockResolvedValueOnce({
      ok: false,
      code: "NO_SAFE_PATCH",
      message: "The AI couldn't build a safe automatic fix.",
      detail: "envelope_mismatch",
      model: { modelId: "gpt-4.1-mini", tier: "fast" },
    });
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "NO_SAFE_PATCH" });
    expect(body.message).toMatch(/safe automatic fix/i);
    // Telemetry retains the sub-reason; the user-facing body never carries `detail`.
    expect(body.detail).toBeUndefined();
    expect(mockRecFailed).toHaveBeenCalledTimes(1);
    const recArg = mockRecFailed.mock.calls[0]![1] as { metadata?: { detail?: string; code?: string } };
    expect(recArg.metadata?.detail).toBe("envelope_mismatch");
    expect(recArg.metadata?.code).toBe("NO_SAFE_PATCH");
  });

  it("a GENUINE MODEL_FAILED still maps to 503 (not collapsed with the handled states)", async () => {
    mockPreviewRepair.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom", model: { modelId: "gpt-4.1-mini", tier: "fast" } });
    const res = await call("wf-1");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("MODEL_FAILED");
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

describe("ai/repair/preview — current draft override + proposal steering", () => {
  const validDraft = {
    nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  };

  it("forwards a VALID draftDefinition to BOTH the diagnosis re-derivation AND the preview validation target", async () => {
    await callBody("wf-1", { draftDefinition: validDraft });
    expect(mockDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectUserId: "user-1",
        workflowId: "wf-1",
        draftOverride: expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ id: "n1" })]) }),
      }),
    );
    // The SAME validated draft is threaded into the preview as the validation target.
    expect(mockPreviewRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        draftDefinition: expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ id: "n1" })]) }),
      }),
    );
  });

  it("forwards NO draftDefinition to the preview when none is supplied (saved fallback)", async () => {
    await call("wf-1");
    expect(mockPreviewRepair).toHaveBeenCalledTimes(1);
    expect(mockPreviewRepair.mock.calls[0]![0].draftDefinition).toBeUndefined();
  });

  it("forwards optional proposalContext steering to the service", async () => {
    await callBody("wf-1", { proposalContext: { summary: "reconnect then set recipient" } });
    expect(mockPreviewRepair).toHaveBeenCalledWith(
      expect.objectContaining({ proposalContext: { summary: "reconnect then set recipient" } }),
    );
  });

  it("INVALID draftDefinition → 400 BEFORE diagnose / gate / model", async () => {
    const res = await callBody("wf-1", { draftDefinition: { nodes: [validDraft.nodes[0], { ...validDraft.nodes[0], id: "n1" }], edges: [] } });
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
  });
});

describe("ai/repair/preview — boundaries (preview-only)", () => {
  it("the route imports no MCP, no apply/patch writers, and triggers no save/run", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/workflows/[id]/ai/repair/preview/route.ts"), "utf8");
    expect(src).not.toMatch(/scripts\/mcp|@\/scripts\/mcp/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatchForAI|applyPatchToDefinition/);
    expect(src).not.toMatch(/saveWorkflow|executeWorkflow|runWorkflow|updateDraftDefinition/);
    expect(src).not.toMatch(/hermes/i);
  });
});

describe("ai/repair/preview — deterministic preview is FREE (AI-REPAIR-3H)", () => {
  const detResult = {
    ok: true,
    preview: {
      ok: true,
      patchSummary: "Re-point the broken variable reference",
      changes: [{ op: "repairVariableReference", description: "Re-points a variable reference.", nodeId: "slack-1" }],
      affectedNodeIds: ["slack-1"],
      affectedEdgeIds: [],
      riskLevel: "low",
      requiresConfirmation: false,
      riskReasons: [],
      validation: { ok: true, errors: [], warnings: [] },
      userFacingSummaryText: "Re-point the broken variable reference — 1 change(s). Risk: low.",
      canApplyLater: true,
      apply: { applyable: true, operations: [{ op: "repairVariableReference", nodeId: "slack-1", fieldPath: "message", newReference: "{{trigger.text}}" }], baseRevision: "rev-1" },
    },
  };

  it("deterministic preview → 200 with the preview; NO credit gate, NO model client, NO model telemetry", async () => {
    mockRunDeterministic.mockResolvedValueOnce(detResult);
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.preview).toEqual(detResult.preview);
    expect(body.notAppliedNotice).toBe("This is a preview only — your workflow wasn't changed, saved, or run.");

    // Free + model-free: no gate, no model factory, no model preview, no telemetry.
    expect(mockGate).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockPreviewRepair).not.toHaveBeenCalled();
    expect(mockRecCompleted).not.toHaveBeenCalled();
    expect(mockRecFailed).not.toHaveBeenCalled();
  });

  it("the Apply metadata (applyable + operations + baseRevision) survives so the Apply button still shows", async () => {
    mockRunDeterministic.mockResolvedValueOnce(detResult);
    const body = await (await call("wf-1")).json();
    expect(body.preview.apply).toEqual({
      applyable: true,
      operations: [{ op: "repairVariableReference", nodeId: "slack-1", fieldPath: "message", newReference: "{{trigger.text}}" }],
      baseRevision: "rev-1",
    });
  });

  it("works even when OpenAI is unconfigured — no model is needed", async () => {
    mockProviderEnabled.mockReturnValue(false);
    delete process.env.OPENAI_API_KEY;
    mockRunDeterministic.mockResolvedValueOnce(detResult);
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockGate).not.toHaveBeenCalled();
  });

  it("works even when AI credits are exhausted — the gate is never consulted", async () => {
    mockGate.mockResolvedValue({ ok: false, reason: "insufficient", used: 100, limit: 100 });
    mockRunDeterministic.mockResolvedValueOnce(detResult);
    const res = await call("wf-1");
    expect(res.status).toBe(200); // NOT 402 — deterministic preview returned before the gate
    expect(mockGate).not.toHaveBeenCalled();
  });

  it("is tried only AFTER the access wall + repairable gate, with the re-derived DTO (never a client DTO)", async () => {
    mockRunDeterministic.mockResolvedValueOnce(detResult);
    await call("wf-1");
    expect(mockRunDeterministic).toHaveBeenCalledTimes(1);
    expect(mockRunDeterministic).toHaveBeenCalledWith(
      expect.objectContaining({ dto: okDto, userId: "user-1", workflowId: "wf-1" }),
    );
  });

  it("no deterministic repair → falls through to the gated, telemetered model path", async () => {
    mockRunDeterministic.mockResolvedValueOnce(null);
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(mockPreviewRepair).toHaveBeenCalledTimes(1);
    expect(mockRecCompleted).toHaveBeenCalledTimes(1); // normal model telemetry still recorded
  });
});
