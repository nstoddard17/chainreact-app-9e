/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/run-failure/route.ts`
 * (Slice 4.MCP-STAGE-2B-3, extracted shell).
 *
 * The route is now a thin gated shell that delegates to the `diagnoseRunReport`
 * capability service. These tests prove the ROUTE's responsibilities only: the
 * gate, input validation, mode parsing, and that it serializes the service's DTO
 * verbatim. The deep per-status + no-leak assertions live in
 * tests/unit/services/diagnostics/runReport.test.ts.
 */

const mockGetRun = jest.fn();
jest.mock("@/repositories/workflowRunsDiagnostics", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetRun(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/run-failure/route";

const GOOD_TOKEN = "diag-run-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/run-failure", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function failedRun() {
  return {
    id: "run-1",
    workflowId: "wf-1",
    accountId: ACCT,
    triggeredByUserId: null,
    status: "failed",
    triggerNodeId: "trigger-1",
    triggerEvent: {},
    steps: [{ nodeId: "action-1", status: "failed", error: { code: "PROVIDER_REAUTH_REQUIRED" } }],
    fatalError: null,
    errorClassification: { title: "T", description: "D", severity: "error" },
    startedAt: "2026-06-01T00:00:00Z",
    finishedAt: "2026-06-01T00:00:01Z",
    createdAt: "2026-06-01T00:00:00Z",
    isTest: false,
    triggeredBy: "manual",
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
  };
}

beforeEach(() => {
  mockGetRun.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

// ───────────────────────────── Gate (route-owned) ─────────────────────────────
describe("run-failure route — gate", () => {
  it("404 when disabled, before any read", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ runId: "run-1", userId: "u1" }))).status).toBe(404);
    expect(mockGetRun).not.toHaveBeenCalled();
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ runId: "run-1", userId: "u1" }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer; token never echoed", async () => {
    expect((await POST(req({ runId: "run-1", userId: "u1" }, null))).status).toBe(401);
    const res = await POST(req({ runId: "run-1", userId: "u1" }, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

// ───────────────────── Input validation (route-owned) ─────────────────────
describe("run-failure route — input validation", () => {
  it("400 when runId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ runId: "run-1" }))).status).toBe(400);
  });
});

// ───────────────────── Delegation + serialization ─────────────────────
describe("run-failure route — delegates to the capability + serializes the DTO", () => {
  it("default (failure) mode → serializes the service's authorized summary verbatim", async () => {
    mockGetRun.mockResolvedValue(failedRun());
    const dto = await (await POST(req({ runId: "run-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({
      runId: "run-1",
      visibility: "FAILED_VISIBLE",
      status: "failed",
      firstFailedNodeId: "action-1",
      classificationAvailable: true,
    });
    expect(dto.steps).toEqual([
      { nodeId: "action-1", status: "failed", errorCode: "PROVIDER_REAUTH_REQUIRED" },
    ]);
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("mode:visibility → serializes ONLY {runId, visibility}", async () => {
    mockGetRun.mockResolvedValue(failedRun());
    const dto = await (await POST(req({ runId: "run-1", userId: "u1", mode: "visibility" }))).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "FAILED_VISIBLE" });
  });

  it("WRONG_ACCOUNT (non-member) → serializes ONLY {runId, visibility}", async () => {
    mockGetRun.mockResolvedValue(failedRun());
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ runId: "run-1", userId: "intruder" }))).json();
    expect(dto).toEqual({ runId: "run-1", visibility: "WRONG_ACCOUNT" });
  });
});
