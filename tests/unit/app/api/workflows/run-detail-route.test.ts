/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/runs/[runId]/route.ts.
 *
 * Verifies the auth gate, the workflowId/runId cross-check, the 404
 * shape, and the wire-shape (steps[], triggerEvent, fatalError surfaced).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

import { GET } from "@/app/api/workflows/[id]/runs/[runId]/route";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-17T00:00:00Z",
  providerAccountId: "system",
  payload: { inputs: {} },
};

const baseRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  workflowId: "22222222-2222-2222-2222-222222222222",
  userId: "user-1",
  status: "succeeded" as const,
  triggerNodeId: "t1",
  triggerEvent,
  steps: [
    {
      nodeId: "t1",
      status: "succeeded" as const,
      output: { event: triggerEvent },
    },
    {
      nodeId: "a1",
      status: "succeeded" as const,
      output: { sentTo: "C123" },
    },
  ],
  fatalError: null,
  errorClassification: null,
  startedAt: "2026-05-17T00:00:00Z",
  finishedAt: "2026-05-17T00:00:01Z",
  createdAt: "2026-05-17T00:00:00Z",
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

function makeRequest(): Request {
  return new Request("http://x/api/workflows/wf-1/runs/run-1");
}

describe("GET /api/workflows/[id]/runs/[runId]", () => {
  it("returns 401 when no user is signed in", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns 404 when the run does not exist (RLS or missing)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the run exists but belongs to a different workflow", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, workflowId: "wf-other" });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the run detail with steps[], triggerEvent, fatalError", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({
      ...baseRecord,
      workflowId: "wf-1",
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: baseRecord.id,
      workflowId: "wf-1",
      status: "succeeded",
      triggerNodeId: "t1",
      fatalError: null,
      errorClassification: null,
    });
    expect(body.triggerEvent).toMatchObject({
      provider: "native",
      eventType: "manual.run",
    });
    expect(body.steps).toHaveLength(2);
    expect(body.steps[1]).toMatchObject({
      nodeId: "a1",
      status: "succeeded",
      output: { sentTo: "C123" },
    });
    // Detail strips userId + createdAt (engine-internal fields).
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("createdAt");
  });

  it("surfaces fatalError + errorClassification for failed runs", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({
      ...baseRecord,
      workflowId: "wf-1",
      status: "failed" as const,
      fatalError: { code: "HANDLER_FAILED", message: "Slack call timed out" },
      errorClassification: {
        title: "Slack call timed out",
        description: "Slack didn't respond in time.",
        hint: "Retry the run.",
        action: "open_node",
        severity: "error" as const,
      },
      steps: [
        {
          nodeId: "a1",
          status: "failed" as const,
          error: { code: "HANDLER_FAILED", message: "Slack call timed out" },
        },
      ],
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.fatalError).toMatchObject({ code: "HANDLER_FAILED" });
    expect(body.errorClassification).toMatchObject({
      title: "Slack call timed out",
      action: "open_node",
      severity: "error",
    });
    expect(body.steps[0].error).toMatchObject({ code: "HANDLER_FAILED" });
  });
});
