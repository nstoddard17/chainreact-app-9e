/**
 * @jest-environment node
 *
 * Tests for GET / DELETE /api/workflows/[id]/ai/thread and
 * POST /api/workflows/[id]/ai/thread/messages (Slice 4.AI-23).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the
 * `workflows` + `builderAgentThreads` repositories + the sanitizer are
 * mocked so the routes' auth / validation / status-mapping / sanitization
 * pipeline is exercised in isolation from the database.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

const mockGetOrCreateThread = jest.fn();
const mockListMessages = jest.fn();
const mockAppendMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/repositories/builderAgentThreads", () => ({
  getOrCreateThreadForWorkflow: (...a: unknown[]) => mockGetOrCreateThread(...a),
  listMessagesForWorkflow: (...a: unknown[]) => mockListMessages(...a),
  appendMessageForWorkflow: (...a: unknown[]) => mockAppendMessage(...a),
  clearThreadForWorkflow: (...a: unknown[]) => mockClearThread(...a),
}));

import { DELETE, GET } from "@/app/api/workflows/[id]/ai/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workflows/[id]/ai/thread/messages/route";

function callGet(id: string) {
  return GET(
    new Request(`http://x/api/workflows/${id}/ai/thread`, { method: "GET" }),
    { params: Promise.resolve({ id }) },
  );
}

function callDelete(id: string) {
  return DELETE(
    new Request(`http://x/api/workflows/${id}/ai/thread`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  );
}

function callAppend(id: string, body: unknown) {
  return POST_MESSAGE(
    new Request(`http://x/api/workflows/${id}/ai/thread/messages`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

const ownedWorkflow = {
  id: "wf-1",
  userId: "user-1",
  name: "WF",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: {},
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const otherUserWorkflow = { ...ownedWorkflow, userId: "user-2" };

const threadRow = {
  id: "thr-1",
  userId: "user-1",
  workflowId: "wf-1",
  title: null,
  createdAt: "2026-05-26T00:00:00Z",
  updatedAt: "2026-05-26T00:00:00Z",
  archivedAt: null,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockGetById.mockReset();
  mockGetOrCreateThread.mockReset();
  mockListMessages.mockReset();
  mockAppendMessage.mockReset();
  mockClearThread.mockReset();
});

describe("GET /api/workflows/[id]/ai/thread", () => {
  it("returns 401 unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "no session" },
    });
    const res = await callGet("wf-1");
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow does not exist (no existence leak)", async () => {
    mockGetById.mockResolvedValueOnce(null);
    const res = await callGet("wf-1");
    expect(res.status).toBe(404);
    expect(mockGetOrCreateThread).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow exists but is owned by another user", async () => {
    mockGetById.mockResolvedValueOnce(otherUserWorkflow);
    const res = await callGet("wf-1");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    // Wording must NOT reveal that the workflow exists (the same message as
    // not-found). Belt + braces: it must NOT include "permission" / "owner".
    expect(body.error).toMatch(/not found/i);
    expect(body.error).not.toMatch(/permission|owner|other user/i);
    expect(mockGetOrCreateThread).not.toHaveBeenCalled();
  });

  it("returns 400 when id is empty", async () => {
    const res = await callGet("   ");
    expect(res.status).toBe(400);
  });

  it("returns thread + messages in chronological order for the owner", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockGetOrCreateThread.mockResolvedValueOnce(threadRow);
    mockListMessages.mockResolvedValueOnce([
      {
        id: "m1",
        threadId: "thr-1",
        userId: "user-1",
        workflowId: "wf-1",
        role: "user",
        kind: "prompt",
        content: "Add slack action",
        safePayload: {},
        createdAt: "2026-05-26T00:00:01Z",
      },
      {
        id: "m2",
        threadId: "thr-1",
        userId: "user-1",
        workflowId: "wf-1",
        role: "assistant",
        kind: "plan_result",
        content: "Added a Slack post",
        safePayload: { ok: true, intentSummary: "Added a Slack post" },
        createdAt: "2026-05-26T00:00:02Z",
      },
    ]);
    const res = await callGet("wf-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      thread: { id: string };
      messages: Array<{ id: string; role: string; kind: string }>;
    };
    expect(body.thread.id).toBe("thr-1");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.role).toBe("user");
    expect(body.messages[1]?.role).toBe("assistant");
  });

  it("does NOT leak the user_id column into the response", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockGetOrCreateThread.mockResolvedValueOnce(threadRow);
    mockListMessages.mockResolvedValueOnce([
      {
        id: "m1",
        threadId: "thr-1",
        userId: "user-1",
        workflowId: "wf-1",
        role: "user",
        kind: "prompt",
        content: "x",
        safePayload: {},
        createdAt: "2026-05-26T00:00:01Z",
      },
    ]);
    const res = await callGet("wf-1");
    const text = await res.text();
    expect(text).not.toContain("user-1");
  });
});

describe("DELETE /api/workflows/[id]/ai/thread", () => {
  it("returns 401 unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "no session" },
    });
    const res = await callDelete("wf-1");
    expect(res.status).toBe(401);
    expect(mockClearThread).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow is owned by another user", async () => {
    mockGetById.mockResolvedValueOnce(otherUserWorkflow);
    const res = await callDelete("wf-1");
    expect(res.status).toBe(404);
    expect(mockClearThread).not.toHaveBeenCalled();
  });

  it("clears the thread for the owner + returns deletedCount", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockClearThread.mockResolvedValueOnce({ deletedCount: 3 });
    const res = await callDelete("wf-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deletedCount: number };
    expect(body.ok).toBe(true);
    expect(body.deletedCount).toBe(3);
    expect(mockClearThread).toHaveBeenCalledWith("user-1", "wf-1");
  });
});

describe("POST /api/workflows/[id]/ai/thread/messages", () => {
  it("returns 401 unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "no session" },
    });
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "x",
    });
    expect(res.status).toBe(401);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow is owned by another user", async () => {
    mockGetById.mockResolvedValueOnce(otherUserWorkflow);
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "x",
    });
    expect(res.status).toBe(404);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    const res = await callAppend("wf-1", "not json{");
    expect(res.status).toBe(400);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown role", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    const res = await callAppend("wf-1", {
      role: "system",
      kind: "prompt",
      content: "x",
    });
    expect(res.status).toBe(400);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown kind", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "applied",
      content: "x",
    });
    expect(res.status).toBe(400);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("appends a sanitized user prompt", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockAppendMessage.mockResolvedValueOnce({
      id: "m1",
      threadId: "thr-1",
      userId: "user-1",
      workflowId: "wf-1",
      role: "user",
      kind: "prompt",
      content: "Post to Slack on new email",
      safePayload: {},
      createdAt: "2026-05-26T00:00:01Z",
    });
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "Post to Slack on new email",
    });
    expect(res.status).toBe(201);
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workflowId: "wf-1",
        message: expect.objectContaining({
          role: "user",
          kind: "prompt",
          content: "Post to Slack on new email",
        }),
      }),
    );
  });

  it("server-side sanitizes — proposedPatch / secret keys are stripped before insert", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockAppendMessage.mockResolvedValueOnce({
      id: "m2",
      threadId: "thr-1",
      userId: "user-1",
      workflowId: "wf-1",
      role: "assistant",
      kind: "plan_result",
      content: "x",
      safePayload: { ok: true, intentSummary: "x" },
      createdAt: "2026-05-26T00:00:02Z",
    });
    await callAppend("wf-1", {
      role: "assistant",
      kind: "plan_result",
      content: "x",
      // Poisoned payload: server MUST drop all of these before insert.
      safePayload: {
        ok: true,
        intentSummary: "x",
        proposedPatch: { patchId: "p1", operations: [{ op: "addNode" }] },
        accessToken: "ya29.real-token-here",
        webhookSecret: "wh-xxx",
        config: { authorization: "Bearer abc123" },
      },
    });
    // The mocked appendMessage receives the sanitizer's output, NOT the raw
    // client body. Inspect that output directly.
    const [callArg] = mockAppendMessage.mock.calls[0]!;
    const payload = (callArg as { message: { safePayload: Record<string, unknown> } }).message.safePayload;
    expect(payload.proposedPatch).toBeUndefined();
    expect(payload.accessToken).toBeUndefined();
    expect(payload.webhookSecret).toBeUndefined();
    expect(payload.config).toBeUndefined();
    expect(payload.ok).toBe(true);
    expect(payload.intentSummary).toBe("x");
  });

  it("server-side sanitizes — secret-shaped content values are [redacted]", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockAppendMessage.mockResolvedValueOnce({
      id: "m3",
      threadId: "thr-1",
      userId: "user-1",
      workflowId: "wf-1",
      role: "user",
      kind: "prompt",
      content: "[redacted]",
      safePayload: {},
      createdAt: "2026-05-26T00:00:03Z",
    });
    await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "my token is ya29.AbCdEfGh1234567890",
    });
    const [callArg] = mockAppendMessage.mock.calls[0]!;
    const sanitized = (callArg as { message: { content: string | null } })
      .message.content;
    expect(sanitized).toBe("[redacted]");
  });

  it("returns 500 when persistence fails", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockAppendMessage.mockRejectedValueOnce(new Error("boom"));
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "x",
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Sanitized error — must NOT leak "boom" / stack / connection strings.
    expect(body.error).not.toMatch(/boom/);
  });
});

// ─── Slice 4.AI-25 follow-up — missing-migration dev visibility ──────────────
//
// Marcus's 2026-05-27 smoke: AI-23 migration not applied locally, so the
// repo throws "Could not find the table 'public.builder_agent_threads' in
// the schema cache". The route now returns a structured 500 with
// `code: "PERSISTENCE_UNAVAILABLE"` + a `migrationHint` so the client can
// surface the supabase-db-push remediation in dev console output.

describe("AI-25 follow-up — schema-cache 500 carries migrationHint", () => {
  const schemaCacheError = new Error(
    "Could not find the table 'public.builder_agent_threads' in the schema cache",
  );
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("GET /ai/thread — schema-cache miss returns 500 with PERSISTENCE_UNAVAILABLE + migrationHint", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockGetOrCreateThread.mockRejectedValueOnce(schemaCacheError);
    const res = await callGet("wf-1");
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: string;
      code: string;
      migrationHint?: string;
    };
    expect(body.code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(body.migrationHint).toContain("supabase db push");
    expect(body.migrationHint).toContain("public.builder_agent_threads");
    // The user-facing `error` field stays generic — it does NOT echo the
    // raw Postgres / PostgREST text into the `error` field. (The
    // `migrationHint` field intentionally mentions "schema cache" as
    // part of the remediation copy — that's dev-time guidance, separate
    // from the user-facing error.)
    expect(body.error).toBe("Failed to load Builder Agent thread.");
    expect(body.error).not.toContain("schema cache");
    expect(body.error).not.toMatch(/\bSQLSTATE\b/);
  });

  it("GET /ai/thread — schema-cache miss logs a dev-friendly diagnostic via console.error", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockGetOrCreateThread.mockRejectedValueOnce(schemaCacheError);
    await callGet("wf-1");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("route=GET /api/workflows/[id]/ai/thread");
    expect(logged).toContain("op=load");
    expect(logged).toContain("Could not find the table");
    expect(logged).toContain("supabase db push");
  });

  it("GET /ai/thread — unrelated error still 500 but WITHOUT migrationHint", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockGetOrCreateThread.mockRejectedValueOnce(new Error("connection refused"));
    const res = await callGet("wf-1");
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      code: string;
      migrationHint?: string;
    };
    expect(body.code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(body.migrationHint).toBeUndefined();
  });

  it("DELETE /ai/thread — schema-cache miss returns 500 + migrationHint", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockClearThread.mockRejectedValueOnce(schemaCacheError);
    const res = await callDelete("wf-1");
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      code: string;
      migrationHint?: string;
    };
    expect(body.code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(body.migrationHint).toContain("supabase db push");
    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("route=DELETE /api/workflows/[id]/ai/thread");
    expect(logged).toContain("op=clear");
  });

  it("POST /ai/thread/messages — schema-cache miss returns 500 + migrationHint", async () => {
    mockGetById.mockResolvedValueOnce(ownedWorkflow);
    mockAppendMessage.mockRejectedValueOnce(schemaCacheError);
    const res = await callAppend("wf-1", {
      role: "user",
      kind: "prompt",
      content: "x",
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      code: string;
      migrationHint?: string;
    };
    expect(body.code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(body.migrationHint).toContain("supabase db push");
    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(logged).toContain("route=POST /api/workflows/[id]/ai/thread/messages");
    expect(logged).toContain("op=append");
  });
});
