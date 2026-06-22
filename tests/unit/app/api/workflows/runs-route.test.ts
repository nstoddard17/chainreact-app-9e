/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/runs/route.ts.
 *
 * Verifies the auth gate, the limit query-param parsing, and the wire-shape
 * stripping (user_id, full payload, full steps[] not in the response).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockListByWorkflow = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  listByWorkflow: (...args: unknown[]) => mockListByWorkflow(...args),
}));

// V2-READY-51 — the list route authorizes EXPLICITLY before reading runs:
// `loadWorkflowForMember` loads the workflow (`workflows.getById`) and confirms
// the caller is a member of its account (`accountMemberships.isMember`). The
// `workflow_runs` read is service-role / non-authorizing, so the gate is the
// security boundary. Stub both data dependencies (not a fake Supabase client)
// so these tests exercise the real gate + the wire-shape behavior.
const mockWorkflowGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockWorkflowGetById(...args),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

import { GET } from "@/app/api/workflows/[id]/runs/route";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi" },
};

const baseRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  workflowId: "22222222-2222-2222-2222-222222222222",
  userId: "user-1",
  status: "succeeded" as const,
  triggerNodeId: "t1",
  triggerEvent,
  steps: [
    { nodeId: "t1", status: "succeeded" as const, output: { event: triggerEvent } },
  ],
  fatalError: null,
  errorClassification: null,
  startedAt: "2026-05-07T00:00:00Z",
  finishedAt: "2026-05-07T00:00:01Z",
  createdAt: "2026-05-07T00:00:00Z",
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockListByWorkflow.mockReset();
  // Default: an existing workflow whose account the caller belongs to, so the
  // existing wire-shape / limit-parsing assertions run against the post-gate
  // (authorized) path. Individual tests override for the not-found / non-member
  // cases.
  mockWorkflowGetById.mockReset();
  mockWorkflowGetById.mockResolvedValue({
    id: "wf-1",
    accountId: "acct-1",
    state: "draft",
  });
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

function makeRequest(url = "http://x/api/workflows/wf-1/runs"): Request {
  return new Request(url);
}

describe("GET /api/workflows/[id]/runs", () => {
  it("returns 401 when no user is signed in", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow is missing or soft-deleted (no run list read)", async () => {
    authedUser();
    mockWorkflowGetById.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("returns 404 (no existence leak) when the caller is not a member of the workflow's account", async () => {
    authedUser();
    mockIsMember.mockResolvedValueOnce(false);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("returns runs as { runs: WorkflowRunSummary[] }, stripping user_id / steps / payload", async () => {
    authedUser();
    mockListByWorkflow.mockResolvedValueOnce([baseRecord]);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
    const r = body.runs[0];
    expect(r).toMatchObject({
      id: baseRecord.id,
      workflowId: baseRecord.workflowId,
      status: "succeeded",
      triggerNodeId: "t1",
      errorClassification: null,
    });
    // The summary intentionally drops these — keep it light.
    expect(r).not.toHaveProperty("userId");
    expect(r).not.toHaveProperty("steps");
    expect(r).not.toHaveProperty("triggerEvent");
    expect(r).not.toHaveProperty("fatalError");
  });

  it("forwards a valid ?limit= query param to the repository", async () => {
    authedUser();
    mockListByWorkflow.mockResolvedValueOnce([]);
    await GET(makeRequest("http://x/api/workflows/wf-1/runs?limit=10"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(mockListByWorkflow).toHaveBeenCalledWith("wf-1", { limit: 10 });
  });

  it("ignores invalid ?limit= and lets the repository use its default", async () => {
    authedUser();
    mockListByWorkflow.mockResolvedValueOnce([]);
    await GET(makeRequest("http://x/api/workflows/wf-1/runs?limit=abc"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(mockListByWorkflow).toHaveBeenCalledWith("wf-1", {});
  });

  it("ignores negative / zero limits", async () => {
    authedUser();
    mockListByWorkflow.mockResolvedValueOnce([]);
    await GET(makeRequest("http://x/api/workflows/wf-1/runs?limit=0"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(mockListByWorkflow).toHaveBeenCalledWith("wf-1", {});
  });

  it("returns the humanized error_classification verbatim for failed runs", async () => {
    authedUser();
    mockListByWorkflow.mockResolvedValueOnce([
      {
        ...baseRecord,
        status: "failed",
        errorClassification: {
          title: "Slack channel not found",
          description: "The channel doesn't exist.",
          hint: "Check the channel id.",
          action: "open_node",
          severity: "error",
        },
      },
    ]);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const body = await res.json();
    expect(body.runs[0].errorClassification).toMatchObject({
      title: "Slack channel not found",
      action: "open_node",
      severity: "error",
    });
  });
});
