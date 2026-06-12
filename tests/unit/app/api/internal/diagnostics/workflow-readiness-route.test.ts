/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/workflow-readiness/route.ts`
 * (Slice 4.MCP-STAGE-2B-3, extracted shell).
 *
 * The route is now a thin gated shell that delegates to the
 * `diagnoseWorkflowReadiness` capability service. These tests prove the
 * ROUTE's responsibilities only: the gate, input validation, and that it
 * serializes the service's DTO verbatim. The deep readiness-mapping + no-leak
 * assertions live in tests/unit/services/diagnostics/workflowReadiness.test.ts.
 */

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/workflow-readiness/route";

const GOOD_TOKEN = "diag-wf-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/workflow-readiness", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const synthTrigger = { id: "trigger-1", kind: "trigger", provider: "synthetic", type: "noop", displayName: "Start", config: {} };
const synthAction = { id: "action-1", kind: "action", provider: "synthetic", type: "noop2", displayName: "Do", config: {} };
function readyWorkflow() {
  return {
    id: "wf-1",
    name: "n",
    accountId: ACCT,
    createdByUserId: "creator-1",
    draftDefinition: { nodes: [synthTrigger, synthAction], edges: [{ id: "e1", from: "trigger-1", to: "action-1" }] },
    definition: { nodes: [], edges: [] },
  };
}

beforeEach(() => {
  mockGetWorkflow.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetProvider.mockReset();
  mockGetProvider.mockReturnValue(undefined); // synthetic provider unregistered
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

// ───────────────────────────── Gate (route-owned) ─────────────────────────────
describe("workflow-readiness route — gate", () => {
  it("404 when disabled, before any read", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }))).status).toBe(404);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer; token never echoed", async () => {
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }, null))).status).toBe(401);
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

// ───────────────────── Input validation (route-owned) ─────────────────────
describe("workflow-readiness route — input validation", () => {
  it("400 when workflowId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ workflowId: "wf-1" }))).status).toBe(400);
  });
});

// ───────────────────── Delegation + serialization ─────────────────────
describe("workflow-readiness route — delegates to the capability + serializes the DTO", () => {
  it("authorized happy path → serializes the service's OK DTO verbatim", async () => {
    mockGetWorkflow.mockResolvedValue(readyWorkflow());
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({
      workflowId: "wf-1",
      access: "OK",
      runnable: true,
      readinessError: null,
      graphIssues: [],
      fieldGaps: [],
    });
    expect(dto.providers).toEqual([{ provider: "synthetic", name: null, enabled: false }]);
    // Subject threaded through to the membership check.
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("NO_ACCOUNT_ACCESS → serializes exactly {workflowId, access}", async () => {
    mockGetWorkflow.mockResolvedValue(readyWorkflow());
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "intruder" }))).json();
    expect(dto).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
  });
});
