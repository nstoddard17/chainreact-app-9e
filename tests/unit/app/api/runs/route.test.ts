/**
 * @jest-environment node
 *
 * Tests for app/api/runs/route.ts (Slice 4.RUNS-PAGE-1).
 *
 * Pins:
 *   - 401 for anonymous callers.
 *   - GET returns the route-safe `{ runs: RunListItem[] }` envelope.
 *   - The DTO carries the joined `workflowName` and never leaks the
 *     source `trigger_event` / `steps` / `fatal_error` / `userId` /
 *     billing columns.
 *   - `?limit=` is parsed and forwarded to the repo (which caps it).
 *   - The workflow-name join is one IN-list call — no per-row fetch.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockListByAccountForDisplay = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  listByAccountForDisplay: (...args: unknown[]) =>
    mockListByAccountForDisplay(...args),
}));

const mockListNamesByIds = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listNamesByIds: (...args: unknown[]) => mockListNamesByIds(...args),
}));

// 4.ACCOUNT-MODEL-8: the route resolves the caller's account before listing
// runs. Map userId -> `acct-<userId>` so "user-1" -> "acct-user-1".
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) =>
    Promise.resolve({ id: `acct-${userId}` }),
}));

import { GET } from "@/app/api/runs/route";

function authedUser(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockListByAccountForDisplay.mockReset();
  mockListNamesByIds.mockReset();
});

describe("GET /api/runs", () => {
  it("returns 401 when no user is signed in", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request("http://x/api/runs"));
    expect(res.status).toBe(401);
    expect(mockListByAccountForDisplay).not.toHaveBeenCalled();
    expect(mockListNamesByIds).not.toHaveBeenCalled();
  });

  it("returns the joined RunListItem envelope and never leaks raw payloads", async () => {
    authedUser();
    mockListByAccountForDisplay.mockResolvedValueOnce([
      {
        id: "11111111-1111-1111-1111-111111111111",
        workflowId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        status: "failed",
        isTest: false,
        triggeredBy: "webhook",
        startedAt: "2026-05-30T12:00:00Z",
        finishedAt: "2026-05-30T12:00:01Z",
        errorClassification: {
          title: "Gmail token expired",
          description: "Reconnect Gmail.",
          severity: "error",
        },
      },
    ]);
    mockListNamesByIds.mockResolvedValueOnce([
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Daily digest" },
    ]);
    const res = await GET(new Request("http://x/api/runs"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[] };
    expect(body.runs).toHaveLength(1);
    const run = body.runs[0] as Record<string, unknown>;
    expect(run.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(run.workflowName).toBe("Daily digest");
    expect(run.status).toBe("failed");
    expect(run.triggeredBy).toBe("webhook");
    expect(run.durationMs).toBe(1000);
    // Banned leakage: no raw payloads / steps / per-step output.
    for (const banned of [
      "userId",
      "user_id",
      "triggerEvent",
      "trigger_event",
      "steps",
      "fatalError",
      "fatal_error",
      "reservedTaskCost",
      "actualTaskCost",
      "billingStatus",
    ]) {
      expect(banned in run).toBe(false);
    }
  });

  it("falls back to 'Untitled workflow' when the joined name is missing", async () => {
    authedUser();
    mockListByAccountForDisplay.mockResolvedValueOnce([
      {
        id: "r1",
        workflowId: "wf-missing",
        status: "succeeded",
        isTest: false,
        triggeredBy: "manual",
        startedAt: "2026-05-30T12:00:00Z",
        finishedAt: "2026-05-30T12:00:01Z",
        errorClassification: null,
      },
    ]);
    mockListNamesByIds.mockResolvedValueOnce([]);
    const res = await GET(new Request("http://x/api/runs"));
    const body = (await res.json()) as { runs: { workflowName: string }[] };
    expect(body.runs[0]?.workflowName).toBe("Untitled workflow");
  });

  it("dedupes workflow ids before the name join (one IN-list call, no per-row fetch)", async () => {
    authedUser();
    mockListByAccountForDisplay.mockResolvedValueOnce([
      {
        id: "r1",
        workflowId: "wf-A",
        status: "succeeded",
        isTest: false,
        triggeredBy: "manual",
        startedAt: "2026-05-30T12:00:00Z",
        finishedAt: "2026-05-30T12:00:01Z",
        errorClassification: null,
      },
      {
        id: "r2",
        workflowId: "wf-A", // same workflow as r1 → must NOT cause two name lookups
        status: "failed",
        isTest: false,
        triggeredBy: "webhook",
        startedAt: "2026-05-30T11:00:00Z",
        finishedAt: "2026-05-30T11:00:01Z",
        errorClassification: null,
      },
      {
        id: "r3",
        workflowId: "wf-B",
        status: "succeeded",
        isTest: false,
        triggeredBy: "scheduled",
        startedAt: "2026-05-30T10:00:00Z",
        finishedAt: "2026-05-30T10:00:01Z",
        errorClassification: null,
      },
    ]);
    mockListNamesByIds.mockResolvedValueOnce([
      { id: "wf-A", name: "Workflow A" },
      { id: "wf-B", name: "Workflow B" },
    ]);
    await GET(new Request("http://x/api/runs"));
    expect(mockListNamesByIds).toHaveBeenCalledTimes(1);
    const ids = mockListNamesByIds.mock.calls[0][0] as string[];
    expect(ids.sort()).toEqual(["wf-A", "wf-B"]);
  });

  it("parses ?limit= and forwards it to the repo", async () => {
    authedUser();
    mockListByAccountForDisplay.mockResolvedValueOnce([]);
    mockListNamesByIds.mockResolvedValueOnce([]);
    await GET(new Request("http://x/api/runs?limit=25"));
    expect(mockListByAccountForDisplay).toHaveBeenCalledWith("acct-user-1", {
      limit: 25,
    });
  });

  it("uses the default limit (50) when ?limit= is omitted or invalid", async () => {
    authedUser();
    mockListByAccountForDisplay.mockResolvedValueOnce([]);
    mockListNamesByIds.mockResolvedValueOnce([]);
    await GET(new Request("http://x/api/runs"));
    expect(mockListByAccountForDisplay).toHaveBeenCalledWith("acct-user-1", {
      limit: 50,
    });

    mockListByAccountForDisplay.mockReset();
    mockListNamesByIds.mockReset();
    mockListByAccountForDisplay.mockResolvedValueOnce([]);
    mockListNamesByIds.mockResolvedValueOnce([]);
    await GET(new Request("http://x/api/runs?limit=not-a-number"));
    expect(mockListByAccountForDisplay).toHaveBeenCalledWith("acct-user-1", {
      limit: 50,
    });
  });
});
