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
