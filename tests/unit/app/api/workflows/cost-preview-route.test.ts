/**
 * @jest-environment node
 *
 * Tests for GET /api/workflows/[id]/cost-preview (Slice 4.COST-5).
 * Auth is exercised through the real `requireUser` (createClient mocked);
 * the service is mocked so the route's auth / 404 / wire-shape contract is
 * isolated from estimator internals.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetPreview = jest.fn();
jest.mock("@/services/billing/workflowCostPreview", () => ({
  getWorkflowCostPreview: (...a: unknown[]) => mockGetPreview(...a),
}));

import { GET } from "@/app/api/workflows/[id]/cost-preview/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockGetPreview.mockReset();
});

function call(id: string) {
  return GET(new Request(`http://x/api/workflows/${id}/cost-preview`), {
    params: Promise.resolve({ id }),
  });
}

const samplePreview = {
  workflowId: "wf-1",
  estimatedTasksPerRun: 2,
  policyVersion: "v1",
  billableNodes: [],
  nonBillableNodes: [],
  unknownCostNodes: [],
  warnings: [],
  nodeBreakdown: [
    { nodeId: "a1", provider: "gmail", type: "send_email", kind: "action", billable: true, estimatedTasks: 1, reason: "provider_action", chargeOn: "success", source: "default_policy" },
  ],
  billing: { tasksLimit: 100, tasksUsed: 10, tasksRemaining: 90, wouldExceedCurrentRemaining: false },
  isEstimate: true,
  note: "Estimated workflow tasks per run. Actual usage may vary depending on which steps run.",
};

describe("GET /api/workflows/[id]/cost-preview", () => {
  it("returns the preview for an authenticated request", async () => {
    mockGetPreview.mockResolvedValueOnce(samplePreview);
    const res = await call("wf-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ workflowId: "wf-1", estimatedTasksPerRun: 2, isEstimate: true });
    expect(mockGetPreview).toHaveBeenCalledWith({ workflowId: "wf-1", userId: "user-1" });
  });

  it("rejects an unauthenticated request with 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call("wf-1");
    expect(res.status).toBe(401);
    expect(mockGetPreview).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow is not found / not owned", async () => {
    mockGetPreview.mockResolvedValueOnce(null);
    const res = await call("missing");
    expect(res.status).toBe(404);
  });

  it("returns a sanitized 500 when the service throws (no internals leaked)", async () => {
    mockGetPreview.mockRejectedValueOnce(new Error("getById failed: secret-connection-string"));
    const res = await call("wf-1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret-connection-string");
    expect(body.error).toBe("Failed to compute cost preview.");
  });

  it("has a stable wire shape and no internal billing-state language", async () => {
    mockGetPreview.mockResolvedValueOnce(samplePreview);
    const res = await call("wf-1");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "billableNodes",
        "billing",
        "estimatedTasksPerRun",
        "isEstimate",
        "nodeBreakdown",
        "nonBillableNodes",
        "note",
        "policyVersion",
        "unknownCostNodes",
        "warnings",
        "workflowId",
      ].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/flat 1\/run|reserve|reconcile|temporary|still wrong/i);
  });
});
