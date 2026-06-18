/**
 * @jest-environment node
 *
 * Tests for lib/api/ai.ts (Slice 4.AI-11) — the Builder AI client.
 *
 * `fetch` is mocked. The client must return STRUCTURED bodies (with `ok`) for
 * handled outcomes at any status (plan 503/502, apply 428/409/400-with-code) and
 * THROW AiApiError only for transport failures whose body has no `ok` (401/404/
 * 500/bad-request).
 */
import {
  AiApiError,
  AI_CREDITS_EXHAUSTED_MESSAGE,
  applyWorkflowPatch,
  askDiagnosisQuestion,
  diagnoseWorkflow,
  explainDiagnosis,
  planWorkflow,
  planWorkflowRepair,
  previewWorkflowRepair,
  requestWorkflowRepair,
} from "@/lib/api/ai";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(impl: jest.Mock) {
  globalThis.fetch = impl as unknown as typeof fetch;
}

describe("planWorkflow", () => {
  it("returns the structured result on 200 and posts to the plan route", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, intentSummary: "x", canApplyLater: true, model: {} }),
    );
    mockFetch(fetchMock);
    const result = await planWorkflow("wf 1", { prompt: "hi", modelTier: "fast" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/workflows/wf%201/ai/plan");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ prompt: "hi", modelTier: "fast" });
  });

  it("returns a structured ok:false body on a 503 (model not configured), without throwing", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(503, { ok: false, code: "MODEL_FAILED", message: "x", errors: [] })));
    const result = await planWorkflow("wf-1", { prompt: "hi" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MODEL_FAILED");
  });

  it("throws AiApiError for a 404 error body (no ok flag)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(404, { error: "Workflow not found." })));
    await expect(planWorkflow("wf-1", { prompt: "hi" })).rejects.toMatchObject({
      name: "AiApiError",
      status: 404,
    });
  });

  it("throws AiApiError for a 401", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(401, { error: "unauthenticated" })));
    await expect(planWorkflow("wf-1", { prompt: "hi" })).rejects.toBeInstanceOf(AiApiError);
  });

  it("throws AiApiError when the body is not JSON", async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response),
    );
    await expect(planWorkflow("wf-1", { prompt: "hi" })).rejects.toMatchObject({ status: 500 });
  });
});

describe("applyWorkflowPatch", () => {
  it("returns the structured result on 200 and posts patch + confirmation", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, appliedPatchId: "p1", updatedAt: "t", summaryText: "s" }),
    );
    mockFetch(fetchMock);
    const result = await applyWorkflowPatch("wf-1", {
      patch: { patchId: "p1" },
      confirmation: { confirmed: true, acceptedRiskLevel: "high", acceptedAt: "t" },
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/workflows/wf-1/ai/apply");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      patch: { patchId: "p1" },
      confirmation: { confirmed: true, acceptedRiskLevel: "high", acceptedAt: "t" },
    });
  });

  it("returns a structured ok:false body on 409 STALE_PATCH without throwing", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(409, { ok: false, code: "STALE_PATCH", message: "x" })));
    const result = await applyWorkflowPatch("wf-1", { patch: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STALE_PATCH");
  });

  it("returns a structured ok:false body on 428 CONFIRMATION_REQUIRED", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(428, { ok: false, code: "CONFIRMATION_REQUIRED", message: "x" })));
    const result = await applyWorkflowPatch("wf-1", { patch: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("throws AiApiError for a 404 error body", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(404, { error: "Workflow not found." })));
    await expect(applyWorkflowPatch("wf-1", { patch: {} })).rejects.toBeInstanceOf(AiApiError);
  });
});

describe("requestWorkflowRepair (AI-13)", () => {
  it("posts to the nested run-scoped repair route and returns the structured result on 200", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        workflowId: "wf-1",
        workflowRunId: "run abc",
        failureSummary: {},
        repairability: "repairable",
        reasonCode: "MISSING_REQUIRED_FIELD",
        proposedPatch: { patchId: "repair:1" },
        preview: { ok: true, riskLevel: "low", requiresConfirmation: false, validation: { ok: true, errors: [], warnings: [] } },
        requiredUserInput: [],
        recommendations: [],
        confidence: "medium",
        safetyNotes: [],
      }),
    );
    mockFetch(fetchMock);

    const result = await requestWorkflowRepair("wf 1", "run abc");
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    // Both segments must be URL-encoded.
    expect(String(url)).toBe("/api/workflows/wf%201/runs/run%20abc/ai/repair");
    // Empty default body still serializes — the server accepts {} (see route body-handling test).
    expect((init as { method?: string }).method).toBe("POST");
  });

  it("forwards the optional forward-compat fields verbatim (server ignores them but client must let UI send them)", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        workflowId: "wf-1",
        workflowRunId: "run-1",
        failureSummary: {},
        repairability: "needsUserInput",
        reasonCode: "MISSING_REQUIRED_FIELD",
        requiredUserInput: [],
        recommendations: [],
        confidence: "medium",
        safetyNotes: [],
      }),
    );
    mockFetch(fetchMock);
    await requestWorkflowRepair("wf-1", "run-1", {
      repairPrompt: "fix the slack node",
      modelTier: "strong",
      selectedNodeId: "n-slack",
    });
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({
      repairPrompt: "fix the slack node",
      modelTier: "strong",
      selectedNodeId: "n-slack",
    });
  });

  it("returns a structured ok:false body on a service-handled error (e.g. 200 + ok:false is impossible — 404/500 are thrown)", async () => {
    // For the repair route every ok:true outcome is 200; service failures map to
    // 404/500 with `error` bodies (no `ok` flag), so the client throws.
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(404, { error: "Workflow run not found." })));
    await expect(requestWorkflowRepair("wf-1", "run-bogus")).rejects.toMatchObject({
      name: "AiApiError",
      status: 404,
    });
  });

  it("throws AiApiError for a 401", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(401, { error: "unauthenticated" })));
    await expect(requestWorkflowRepair("wf-1", "run-1")).rejects.toBeInstanceOf(AiApiError);
  });

  it("throws AiApiError for a sanitized 500", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(500, { error: "Failed to suggest a repair." })));
    await expect(requestWorkflowRepair("wf-1", "run-1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("planWorkflowRepair (AI-REPAIR-1b)", () => {
  it("posts to the diagnosis-scoped repair-plan route and returns the proposal on 200", async () => {
    const proposal = {
      summary: "Reconnect Gmail.",
      recommendedActions: ["Reconnect Gmail"],
      affectedNodes: ["Gmail — Send Email"],
      missingInfo: [],
      riskLevel: "low",
      canAutoPatchLater: false,
      requiresUserAction: true,
      notAppliedNotice: "This is a suggestion only — your workflow wasn't changed, saved, or run.",
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, proposal }));
    mockFetch(fetchMock);

    const result = await planWorkflowRepair("wf 1");
    expect(result).toEqual({ ok: true, proposal });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/workflows/wf%201/ai/repair/plan");
    expect((init as { method?: string }).method).toBe("POST");
    expect((init as { body: string }).body).toBe("{}");
  });

  it("maps a 402 AI_CREDITS_EXHAUSTED to the shared safe credit message (no raw server text)", async () => {
    mockFetch(
      jest.fn().mockResolvedValue(
        jsonResponse(402, { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "raw server copy that must not surface" }),
      ),
    );
    const result = await planWorkflowRepair("wf-1");
    expect(result).toEqual({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: AI_CREDITS_EXHAUSTED_MESSAGE });
    if (!result.ok) expect(result.message).not.toContain("raw server copy");
  });

  it("maps a 503 MODEL_FAILED to a safe generic message (no internals)", async () => {
    mockFetch(
      jest.fn().mockResolvedValue(
        jsonResponse(503, { ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" }),
      ),
    );
    const result = await planWorkflowRepair("wf-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MODEL_FAILED");
      expect(result.message).toBe("Couldn't suggest a fix right now. Please try again.");
      expect(result.message).not.toContain("SECRET-INTERNAL");
    }
  });

  it("maps a 503 AI_GATE_ERROR safely too", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(503, { ok: false, code: "AI_GATE_ERROR", message: "x" })));
    const result = await planWorkflowRepair("wf-1");
    expect(result).toEqual({ ok: false, code: "AI_GATE_ERROR", message: "Couldn't suggest a fix right now. Please try again." });
  });

  it("throws AiApiError for a transport failure with no ok flag (401)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(401, { error: "unauthenticated" })));
    await expect(planWorkflowRepair("wf-1")).rejects.toBeInstanceOf(AiApiError);
  });

  it("throws AiApiError for a sanitized 500", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(500, { error: "Failed to diagnose the workflow." })));
    await expect(planWorkflowRepair("wf-1")).rejects.toMatchObject({ name: "AiApiError", status: 500 });
  });
});

describe("AI-DIAG-FIX-1 — diagnosis clients forward the current builder draft", () => {
  const draft = {
    nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  } as never;

  it("diagnoseWorkflow posts { draftDefinition } with a draft, {} without", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { workflowId: "wf-1", access: "OK" }));
    mockFetch(fetchMock);
    await diagnoseWorkflow("wf-1", draft);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ draftDefinition: draft });

    fetchMock.mockClear();
    await diagnoseWorkflow("wf-1");
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({});
  });

  it("explainDiagnosis posts { draftDefinition } when given a draft", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, explanation: "x" }));
    mockFetch(fetchMock);
    await explainDiagnosis("wf-1", draft);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ draftDefinition: draft });
  });

  it("planWorkflowRepair posts { draftDefinition } when given a draft", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, proposal: {} }));
    mockFetch(fetchMock);
    await planWorkflowRepair("wf-1", draft);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ draftDefinition: draft });
  });
});

describe("askDiagnosisQuestion (AI-DIAG-QA-2)", () => {
  const draft = {
    nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  } as never;

  it("POSTs the encoded qa URL with { question } and optional draft + selectedNodeId; never a DTO", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, answer: "x" }));
    mockFetch(fetchMock);
    await askDiagnosisQuestion("wf 1", "Why won't this run?", draft, "n1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/workflows/wf%201/ai/diagnose/qa");
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ question: "Why won't this run?", draftDefinition: draft, selectedNodeId: "n1" });
    expect(body).not.toHaveProperty("dto");
  });

  it("omits draftDefinition + selectedNodeId when not supplied", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, answer: "x" }));
    mockFetch(fetchMock);
    await askDiagnosisQuestion("wf-1", "What should I fix first?");
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ question: "What should I fix first?" });
  });

  it("returns a structured ok:false body on 402 (credits) without throwing", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(402, { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "x", errors: [] })));
    const res = await askDiagnosisQuestion("wf-1", "hi");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("AI_CREDITS_EXHAUSTED");
  });

  it("forwards a forward-compatible safe success body (answer + pointers + needsUserDecision)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(200, { ok: true, answer: "Reconnect Gmail.", pointers: ["Use Preview fix"], needsUserDecision: false })));
    const res = await askDiagnosisQuestion("wf-1", "hi");
    expect(res).toMatchObject({ ok: true, answer: "Reconnect Gmail.", pointers: ["Use Preview fix"], needsUserDecision: false });
  });

  it("throws AiApiError for a 400 (bad question) error body (no ok flag)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(400, { error: "A question is required." })));
    await expect(askDiagnosisQuestion("wf-1", "")).rejects.toMatchObject({ name: "AiApiError", status: 400 });
  });
});

describe("previewWorkflowRepair (AI-REPAIR-2b)", () => {
  const draft = {
    nodes: [{ id: "n1", kind: "trigger", provider: "native", type: "manual_trigger", config: {}, position: { x: 0, y: 0 } }],
    edges: [],
  } as never;

  const previewBody = {
    ok: true,
    preview: {
      ok: true,
      patchSummary: "Set the recipient.",
      changes: [{ op: "updateNodeConfig", description: 'Updates "Gmail — Send Email"', nodeId: "node-B" }],
      affectedNodeIds: ["node-B"],
      affectedEdgeIds: [],
      riskLevel: "low",
      requiresConfirmation: false,
      riskReasons: [],
      validation: { ok: true, errors: [], warnings: [] },
      userFacingSummaryText: "x",
      canApplyLater: true,
    },
    notAppliedNotice: "This is a preview only — your workflow wasn't changed, saved, or run.",
  };

  it("posts to the repair-preview route and returns the preview on 200", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, previewBody));
    mockFetch(fetchMock);
    const result = await previewWorkflowRepair("wf 1");
    expect(result).toEqual(previewBody);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/workflows/wf%201/ai/repair/preview");
    expect((init as { method?: string }).method).toBe("POST");
    expect((init as { body: string }).body).toBe("{}");
  });

  it("sends { draftDefinition } when given a draft", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, previewBody));
    mockFetch(fetchMock);
    await previewWorkflowRepair("wf-1", draft);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({ draftDefinition: draft });
  });

  it("sends { proposalContext } when given steering", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, previewBody));
    mockFetch(fetchMock);
    await previewWorkflowRepair("wf-1", undefined, { summary: "reconnect then set recipient" });
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)).toEqual({
      proposalContext: { summary: "reconnect then set recipient" },
    });
  });

  it("maps a 402 AI_CREDITS_EXHAUSTED to the shared safe credit message (no raw server text)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(402, { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "raw server copy that must not surface" })));
    const result = await previewWorkflowRepair("wf-1");
    expect(result).toEqual({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: AI_CREDITS_EXHAUSTED_MESSAGE });
    if (!result.ok) expect(result.message).not.toContain("raw server copy");
  });

  it("maps a 503 MODEL_FAILED to a safe generic message (no internals)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(503, { ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" })));
    const result = await previewWorkflowRepair("wf-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MODEL_FAILED");
      expect(result.message).toBe("Couldn't build a repair preview right now. Please try again.");
      expect(result.message).not.toContain("SECRET-INTERNAL");
    }
  });

  it("maps a 500 GRAPH_UNAVAILABLE structured failure to safe preview copy", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(500, { ok: false, code: "GRAPH_UNAVAILABLE", message: "x" })));
    const result = await previewWorkflowRepair("wf-1");
    expect(result).toEqual({ ok: false, code: "GRAPH_UNAVAILABLE", message: "Couldn't build a repair preview right now. Please try again." });
  });

  // AI-REPAIR-2D — the two HANDLED, non-503 states come back as 200 ok:false bodies;
  // the client maps them to UI-owned, "run Check workflow again" copy (no raw server text).
  it("maps a 200 NOTHING_TO_PREVIEW to the 'already fixed / run Check again' copy", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(200, { ok: false, code: "NOTHING_TO_PREVIEW", message: "server copy that must not surface" })));
    const result = await previewWorkflowRepair("wf-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOTHING_TO_PREVIEW");
      expect(result.message).toMatch(/already be fixed/i);
      expect(result.message).toMatch(/run check workflow again/i);
      expect(result.message).not.toContain("must not surface");
    }
  });

  it("maps a 200 NO_SAFE_PATCH to the 'safe automatic fix / run Check again' copy", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(200, { ok: false, code: "NO_SAFE_PATCH", message: "server copy" })));
    const result = await previewWorkflowRepair("wf-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_SAFE_PATCH");
      expect(result.message).toMatch(/safe automatic fix/i);
    }
  });

  it("throws AiApiError for a transport failure with no ok flag (401)", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(401, { error: "unauthenticated" })));
    await expect(previewWorkflowRepair("wf-1")).rejects.toBeInstanceOf(AiApiError);
  });

  it("throws AiApiError for a 404 with no ok flag", async () => {
    mockFetch(jest.fn().mockResolvedValue(jsonResponse(404, { error: "Workflow not found." })));
    await expect(previewWorkflowRepair("wf-1")).rejects.toMatchObject({ name: "AiApiError", status: 404 });
  });
});
