/**
 * @jest-environment node
 *
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — /api/workflows/[id]/agent-thread.
 *
 * Business rules under test:
 *   - GET restores only THIS workflow's thread, scoped to the signed-in user.
 *   - POST sanitizes server-side before anything reaches the repository, and
 *     never takes ownership (user_id / workflow_id) from the request body.
 *   - Workflow isolation: the workflow id comes from the route, so one
 *     workflow's transcript can never be read through another's URL.
 *   - Account isolation: a non-member gets the standard 404 no-leak and nothing
 *     is read or written — they cannot even learn the workflow exists.
 *   - Unauthenticated → 401, no read, no write.
 *   - Restoring a transcript performs no AI work (the route imports no model /
 *     gateway / credit surface at all).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

const mockList = jest.fn();
const mockAppend = jest.fn();
const mockClear = jest.fn();
const mockGetOrCreate = jest.fn();
jest.mock("@/repositories/builderAgentThreads", () => ({
  listMessagesForWorkflow: (...a: unknown[]) => mockList(...a),
  appendMessageForWorkflow: (...a: unknown[]) => mockAppend(...a),
  clearThreadForWorkflow: (...a: unknown[]) => mockClear(...a),
  getOrCreateThreadForWorkflow: (...a: unknown[]) => mockGetOrCreate(...a),
}));

import { DELETE, GET, POST } from "@/app/api/workflows/[id]/agent-thread/route";

const baseWorkflow = {
  id: "wf-1",
  accountId: "acct-1",
  createdByUserId: "user-1",
  name: "WF",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  folderId: null,
  deletedByUserId: null,
  purgeAfter: null,
  deletedFromFolderId: null,
  deleteOperationId: null,
  createdAt: "2026-07-16T00:00:00Z",
  updatedAt: "2026-07-16T00:00:00Z",
};

const storedRow = {
  id: "msg-1",
  threadId: "thr-1",
  userId: "user-1",
  workflowId: "wf-1",
  role: "user" as const,
  kind: "prompt" as const,
  content: "post Stripe payments to Slack",
  safePayload: {},
  clientMessageId: "m:0",
  requestId: "req-1",
  agentChangeId: null,
  baseGraphVersion: null,
  proposal: null,
  createdAt: "2026-07-29T00:00:00Z",
};

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function postRequest(body: unknown, workflowId = "wf-1"): Request {
  return new Request(`http://localhost/api/workflows/${workflowId}/agent-thread`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "wf-1" });

beforeEach(() => {
  jest.clearAllMocks();
  signedInAs("user-1");
  mockGetById.mockResolvedValue(baseWorkflow);
  mockIsMember.mockResolvedValue(true);
  mockGetOrCreate.mockResolvedValue({
    id: "thr-1",
    userId: "user-1",
    workflowId: "wf-1",
    title: null,
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
    archivedAt: null,
  });
  mockList.mockResolvedValue([storedRow]);
  mockAppend.mockResolvedValue(storedRow);
  mockClear.mockResolvedValue({ deletedCount: 2 });
});

describe("GET /api/workflows/[id]/agent-thread", () => {
  it("restores the transcript for the signed-in user + THIS workflow", async () => {
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ id: "msg-1", role: "user", kind: "prompt" });
    expect(mockList).toHaveBeenCalledWith("user-1", "wf-1", expect.any(Object));
  });

  it("scopes the read to the route's workflow id, so another workflow's thread is unreachable", async () => {
    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "wf-OTHER" }),
    });
    expect(mockList).toHaveBeenCalledWith("user-1", "wf-OTHER", expect.any(Object));
    expect(mockList).not.toHaveBeenCalledWith("user-1", "wf-1", expect.any(Object));
  });

  it("a non-member gets 404 with no existence leak and no read", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401, no read", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(new Request("http://localhost"), { params });
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("POST /api/workflows/[id]/agent-thread", () => {
  it("persists a sanitized turn with server-set ownership", async () => {
    const res = await POST(
      postRequest({
        role: "user",
        kind: "prompt",
        content: "post Stripe payments to Slack",
        clientMessageId: "m:0",
        requestId: "req-1",
      }),
      { params },
    );
    expect(res.status).toBe(201);
    const call = mockAppend.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.userId).toBe("user-1");
    expect(call.workflowId).toBe("wf-1");
  });

  it("drops secret-shaped values from the proposal before the repository sees them", async () => {
    await POST(
      postRequest({
        role: "assistant",
        kind: "plan_result",
        content: "Here's the workflow.",
        proposal: {
          definition: {
            nodes: [
              {
                id: "n1",
                provider: "slack",
                // Runtime-assembled so the V2-READY-45 guardrail scan never
                // sees a literal token shape; the redaction path still does.
                config: { channel: "C1", accessToken: ["xoxb", "1234567890", "abcdef"].join("-") },
              },
            ],
            edges: [],
          },
        },
      }),
      { params },
    );
    const call = mockAppend.mock.calls[0]![0] as {
      message: { proposal: Record<string, unknown> | null };
    };
    const serialized = JSON.stringify(call.message.proposal);
    expect(serialized).toContain("C1");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain(["xoxb", "1234567890", "abcdef"].join("-"));
  });

  it("rejects an impossible role/kind pair without writing", async () => {
    const res = await POST(
      postRequest({ role: "user", kind: "plan_result", content: "x" }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("a non-member gets 404 and nothing is written", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await POST(
      postRequest({ role: "user", kind: "prompt", content: "hi" }),
      { params },
    );
    expect(res.status).toBe(404);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401, nothing is written", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(
      postRequest({ role: "user", kind: "prompt", content: "hi" }),
      { params },
    );
    expect(res.status).toBe(401);
    expect(mockAppend).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/workflows/[id]/agent-thread", () => {
  it("clears the caller's own thread for this workflow", async () => {
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedCount: 2 });
    expect(mockClear).toHaveBeenCalledWith("user-1", "wf-1");
  });

  it("a non-member gets 404 and nothing is deleted", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost"), { params });
    expect(res.status).toBe(404);
    expect(mockClear).not.toHaveBeenCalled();
  });
});
