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
  applyWorkflowPatch,
  planWorkflow,
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
