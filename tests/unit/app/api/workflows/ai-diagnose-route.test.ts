/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/diagnose (Slice 4.AI-DIAG-1).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the
 * composition service is mocked so the route's auth / validation / delegation /
 * serialization contract is isolated. Read-only; no model/network.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockDiagnose = jest.fn();
jest.mock("@/services/ai/diagnostics/diagnoseWorkflowForAgent", () => ({
  diagnoseWorkflowForAgent: (...a: unknown[]) => mockDiagnose(...a),
}));

// AI-DIAG-2-pre — the route records the 0-credit telemetry to the WORKFLOW-OWNING
// account via loadWorkflowForMember. Partial-mock `_shared` so loadWorkflowForMember
// is controllable while requireUser stays real (the auth contract is still exercised).
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => {
  const actual = jest.requireActual("@/app/api/workflows/_shared");
  return {
    ...actual,
    loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
  };
});
const mockRecordEvent = jest.fn();
jest.mock("@/services/billing/aiCostEvents", () => ({
  recordAiCostEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/workflows/[id]/ai/diagnose/route";

function call(id: string) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockDiagnose.mockReset();
  mockLoadWorkflowForMember.mockReset();
  mockLoadWorkflowForMember.mockResolvedValue({
    ok: true,
    record: { id: "wf-1", accountId: "acct-wf-1" },
  });
  mockRecordEvent.mockReset();
  mockRecordEvent.mockResolvedValue(undefined);
});

describe("ai/diagnose route — auth", () => {
  it("401 for an unauthenticated request; never calls the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });
});

describe("ai/diagnose route — delegation + serialization", () => {
  it("forwards the SESSION user as the subject and serializes the DTO verbatim", async () => {
    const dto = {
      workflowId: "wf-1",
      access: "OK",
      overallReady: false,
      runnable: false,
      allRequiredConnected: false,
      findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x" }],
      summaryText: "…",
      nextSteps: ["Reconnect Gmail."],
    };
    mockDiagnose.mockResolvedValue(dto);
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dto);
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
  });

  it("serializes an access-wall DTO verbatim", async () => {
    mockDiagnose.mockResolvedValue({ workflowId: "wf-x", access: "NO_ACCESS" });
    const res = await call("wf-x");
    expect(await res.json()).toEqual({ workflowId: "wf-x", access: "NO_ACCESS" });
  });

  it("500 (sanitized) when the service throws; no internals leaked", async () => {
    mockDiagnose.mockRejectedValue(new Error("getServiceRoleClient: SECRET_CONN_STRING"));
    const res = await call("wf-1");
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("SECRET_CONN_STRING");
  });
});

// ── AI-DIAG-FIX-1: current-builder-draft snapshot (diagnose the canvas, not stale saved) ──
function callWithBody(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const validDraft = {
  nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
};

describe("ai/diagnose route — current draft override", () => {
  beforeEach(() => mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "OK", overallReady: false }));

  it("forwards a VALID draftDefinition to the diagnosis as draftOverride (diagnoses unsaved state)", async () => {
    const res = await callWithBody("wf-1", { draftDefinition: validDraft });
    expect(res.status).toBe(200);
    expect(mockDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectUserId: "user-1",
        workflowId: "wf-1",
        draftOverride: expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ id: "n1", type: "manual_trigger" })]),
        }),
      }),
    );
  });

  it("no body → diagnoses the SAVED state (no draftOverride passed) — back-compat", async () => {
    await call("wf-1");
    expect(mockDiagnose).toHaveBeenCalledWith({ subjectUserId: "user-1", workflowId: "wf-1" });
  });

  it("INVALID draftDefinition → 400, the diagnosis service is NEVER called (no save/run either)", async () => {
    // Two triggers — WorkflowDefinitionSchema rejects it.
    const res = await callWithBody("wf-1", {
      draftDefinition: { nodes: [validDraft.nodes[0], { ...validDraft.nodes[0], id: "n2" }], edges: [] },
    });
    expect(res.status).toBe(400);
    expect(mockDiagnose).not.toHaveBeenCalled();
  });

  it("the route imports no apply/patch/save/run writers (Check mutates nothing)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/diagnose/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/applyWorkflowPatch|applyPatchToDefinition|updateDraftDefinition/);
    expect(src).not.toMatch(/saveWorkflow|executeWorkflow|runWorkflow/);
    expect(src).not.toMatch(/scripts\/mcp/);
  });
});

describe("ai/diagnose route — 0-credit telemetry on the workflow-owning account (AI-DIAG-2-pre)", () => {
  it("records a 0-credit deterministic event to the workflow-owning account on access OK", async () => {
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "OK", overallReady: true });
    await call("wf-1");
    expect(mockLoadWorkflowForMember).toHaveBeenCalledWith("wf-1", "user-1");
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    const event = mockRecordEvent.mock.calls[0]![0];
    expect(event).toMatchObject({
      accountId: "acct-wf-1",
      userId: "user-1",
      workflowId: "wf-1",
      feature: "other",
      eventType: "ai_cost_recorded",
      aiCreditsCharged: 0,
      success: true,
    });
    expect(event.metadata).toMatchObject({ kind: "workflow_diagnosis", deterministic: true });
  });

  it("personal workflow → records to the personal/workflow account (record.accountId)", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-1", accountId: "acct-personal-1" },
    });
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "OK" });
    await call("wf-1");
    expect(mockRecordEvent.mock.calls[0]![0].accountId).toBe("acct-personal-1");
  });

  it("team workflow → records to the team/workflow account, NOT the actor's personal id", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-team", accountId: "acct-team-7" },
    });
    mockDiagnose.mockResolvedValue({ workflowId: "wf-team", access: "OK" });
    await call("wf-team");
    const acct = mockRecordEvent.mock.calls[0]![0].accountId;
    expect(acct).toBe("acct-team-7");
    expect(acct).not.toBe("user-1");
  });

  it("does NOT resolve an account or record for an access wall (NO_ACCESS / NOT_FOUND — no leak)", async () => {
    mockDiagnose.mockResolvedValue({ workflowId: "wf-x", access: "NO_ACCESS" });
    const res = await call("wf-x");
    expect(mockLoadWorkflowForMember).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ workflowId: "wf-x", access: "NO_ACCESS" });
  });

  it("fail-open: skips telemetry (still 200) when the workflow read races to !ok", async () => {
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "OK" });
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Workflow not found." }, { status: 404 }),
    });
    const res = await call("wf-1");
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflowId: "wf-1", access: "OK" });
  });

  it("a telemetry failure NEVER breaks the diagnosis response (fail-open)", async () => {
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "OK" });
    mockRecordEvent.mockRejectedValue(new Error("ledger down: SECRET"));
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflowId: "wf-1", access: "OK" });
  });

  it("stays 0-credit and ungated — the route imports no gate and makes no model call", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/diagnose/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/aiCreditGate/);
    expect(src).not.toMatch(/generateStructuredJson|createModelClient|modelClients/);
    expect(src).not.toMatch(/ENABLE_AI_CREDIT_ENFORCEMENT/);
  });
});
