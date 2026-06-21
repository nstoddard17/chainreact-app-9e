/**
 * @jest-environment node
 *
 * Tests for lib/api/ai.ts — the Builder AI client.
 *
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 2 (2026-06-21): the chat-only client functions
 * (`planWorkflow`, `completePlan`, `diagnoseWorkflow`/`explainDiagnosis`/`askDiagnosisQuestion`,
 * `planWorkflowRepair`/`previewWorkflowRepair`) + their tests were removed with the chat subtree.
 * The only LIVE client function here is `applyWorkflowPatch` (used by the run-results repair block
 * for explicit apply → `POST /api/workflows/[id]/ai/apply`).
 *
 * `fetch` is mocked. The client returns STRUCTURED bodies (with `ok`) for handled outcomes at any
 * status (apply 428/409/400-with-code) and THROWS AiApiError only for transport failures whose body
 * has no `ok` (401/404/500).
 */
import { AiApiError, applyWorkflowPatch } from "@/lib/api/ai";

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
