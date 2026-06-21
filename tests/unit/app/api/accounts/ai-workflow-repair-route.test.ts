/**
 * @jest-environment node
 *
 * Tests for POST /api/accounts/[id]/ai/workflow-repair (HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR).
 *
 * Gate order: auth+membership+freeze -> strict body { workflowId, runId } -> workflow ownership
 * (cross-account → no-leak 404) -> deterministic suggester (run ownership via NOT_FOUND) -> audit.
 * The route makes NO model / Hermes / gateway call, so there is no charge / availability / parse
 * surface to map. The deterministic suggester + audit recorder are mocked at the route boundary;
 * this asserts the route's auth/ownership/body/status mapping, audit scope, and value-free passthrough.
 */
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

const mockSuggest = jest.fn();
jest.mock("@/services/ai/repair", () => ({ suggestWorkflowRepairForAI: (...a: unknown[]) => mockSuggest(...a) }));

const mockRecord = jest.fn();
jest.mock("@/services/ai/events", () => ({ recordAiRepairOutcome: (...a: unknown[]) => mockRecord(...a) }));

import { POST } from "@/app/api/accounts/[id]/ai/workflow-repair/route";

const ACCOUNT = "acct-1";
const WF = "wf-1";
const RUN = "run-9";
const wfRecord = { id: WF, accountId: ACCOUNT, createdByUserId: "user-1", draftDefinition: { nodes: [], edges: [] } };
const repairOk = {
  ok: true,
  workflowId: WF,
  workflowRunId: RUN,
  failureSummary: { failed: true, status: "failed", isTest: false, failedNodeId: "n1", errorCode: "MISSING_REQUIRED_FIELD", classification: null },
  repairability: "repairable",
  reasonCode: "MISSING_REQUIRED_FIELD",
  proposedPatch: { patchId: "repair:1", workflowId: WF, baseRevision: "rev", operations: [], summary: "s", rationale: "r" },
  preview: { ok: true, riskLevel: "low", requiresConfirmation: false, validation: { ok: true, errors: [], warnings: [] }, changes: [] },
  requiredUserInput: [],
  recommendations: ["Set the missing field."],
  confidence: "high",
  safetyNotes: [],
};

function call(id: string, body: unknown) {
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return POST(new Request(`http://x/api/accounts/${id}/ai/workflow-repair`, init), { params: Promise.resolve({ id }) });
}
const goodBody = { workflowId: WF, runId: RUN };

beforeEach(() => {
  mockRequireUserWithAccount.mockReset().mockResolvedValue({ ok: true, userId: "user-1", accountId: ACCOUNT });
  mockLoadWorkflowForMember.mockReset().mockResolvedValue({ ok: true, record: wfRecord });
  mockSuggest.mockReset().mockResolvedValue(repairOk);
  mockRecord.mockReset().mockResolvedValue(undefined);
});

describe("workflow-repair route — auth + ownership", () => {
  it("returns the auth failure response when unauthenticated / not a member", async () => {
    mockRequireUserWithAccount.mockResolvedValueOnce({ ok: false, response: new Response("no", { status: 401 }) });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(401);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("404s (no leak) when the workflow belongs to a DIFFERENT account", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: true, record: { ...wfRecord, accountId: "other-acct" } });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(404);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("returns the loadWorkflowForMember failure (missing / non-member) verbatim", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({ ok: false, response: new Response("nf", { status: 404 }) });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(404);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("404s when the run is missing / not owned / wrong workflow (suggester NOT_FOUND)", async () => {
    mockSuggest.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "x" });
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/run not found/i);
  });
});

describe("workflow-repair route — body validation", () => {
  it("400s when workflowId is missing", async () => {
    const res = await call(ACCOUNT, { runId: RUN });
    expect(res.status).toBe(400);
    expect(mockSuggest).not.toHaveBeenCalled();
  });
  it("400s when runId is missing", async () => {
    const res = await call(ACCOUNT, { workflowId: WF });
    expect(res.status).toBe(400);
  });
  it("400s on a client-supplied extra field (.strict blocks accountId injection)", async () => {
    const res = await call(ACCOUNT, { workflowId: WF, runId: RUN, accountId: "evil" });
    expect(res.status).toBe(400);
    expect(mockSuggest).not.toHaveBeenCalled();
  });
});

describe("workflow-repair route — success + audit + no-leak", () => {
  it("calls the deterministic suggester with the actor + ids and returns the value-free result (200)", async () => {
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(200);
    expect(mockSuggest).toHaveBeenCalledWith({ userId: "user-1", workflowId: WF, workflowRunId: RUN });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reasonCode).toBe("MISSING_REQUIRED_FIELD");
    // Value-free passthrough — no tokens / secrets / provider account ids in the response.
    expect(JSON.stringify(body)).not.toMatch(/token|secret|refresh|xox|Bearer|password|acct_/i);
  });

  it("writes a scoped audit row (accountId cost-owner + actor + ids) and never blocks on audit errors", async () => {
    mockRecord.mockRejectedValueOnce(new Error("audit down"));
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(200); // audit failure does not break the route
    expect(mockRecord).toHaveBeenCalledWith(
      { accountId: ACCOUNT, userId: "user-1", workflowId: WF, workflowRunId: RUN },
      expect.objectContaining({ ok: true }),
    );
  });

  it("returns a sanitized 500 when the suggester throws (no internals leaked)", async () => {
    mockSuggest.mockRejectedValueOnce(new Error("postgres: connection-string leaked"));
    const res = await call(ACCOUNT, goodBody);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/postgres|connection-string/i);
  });
});
