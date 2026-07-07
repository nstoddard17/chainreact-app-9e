/**
 * @jest-environment node
 *
 * Tests for the shared Asana webhook receive helper — Slice 5.ASANA-1 +
 * ASANA-2 (post-fetch enrichment for task_completed / task_assigned /
 * comment_added_to_task).
 *
 * Uses the REAL signature verifier (crypto HMAC) with a reversible fake
 * for the token-encryption seam, and mocks the trigger-row repo, the
 * integration lookup, refreshAndRetry, and the Asana task/story wrappers.
 */
import { createHmac } from "node:crypto";

const mockFind = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockTasksGet = jest.fn();
const mockStoriesGet = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => {
    if (!s.startsWith("enc(") || !s.endsWith(")")) throw new Error("bad ciphertext");
    return s.slice(4, -1);
  },
}));

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksGet: (...args: unknown[]) => mockTasksGet(...args),
}));

jest.mock("@/integrations/_shared/asana/api/stories", () => ({
  storiesGet: (...args: unknown[]) => mockStoriesGet(...args),
}));

import { receiveAsanaWebhook } from "@/integrations/asana/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/asana/errors";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";

const SECRET = "asana-hook-secret-1";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makeRequest(
  body: string,
  opts: {
    sig?: string | null;
    hookSecret?: string;
    query?: string;
  } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["x-hook-signature"] = opts.sig;
  if (opts.hookSecret !== undefined) headers["x-hook-secret"] = opts.hookSecret;
  return new Request(`https://app.test/api/webhooks/asana${query}`, {
    method: "POST",
    headers,
    body,
  });
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf",
    workflowAccountId: "acct-wf",
    userId: "user-1",
    provider: "asana",
    eventType: "new_task_in_project",
    nodeId: "n",
    config: {
      projectId: "p-1",
      hookSecretEncrypted: `enc(${SECRET})`,
      webhookEnabled: true,
      handshakePending: false,
    },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function taskEvent(overrides: Record<string, unknown> = {}) {
  return {
    user: { gid: "actor-1" },
    resource: {
      gid: "t-1",
      resource_type: "task",
      resource_subtype: "default_task",
    },
    parent: { gid: "p-1", resource_type: "project" },
    action: "added",
    created_at: "2026-07-04T05:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockFind.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockReset();
  mockTasksGet.mockReset();
  mockStoriesGet.mockReset();
  mockGetActiveForExecution.mockResolvedValue({
    accountId: "acct-wf",
    provider: "asana",
    providerAccountId: "asana-user@example.test",
  });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall("access-token-123"),
  );
});

describe("receiveAsanaWebhook — X-Hook-Secret handshake", () => {
  it("stores the secret ENCRYPTED on a pending row and echoes it", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({
        config: { projectId: "p-1", handshakePending: true, webhookEnabled: false },
      }),
    );
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "fresh-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake", secret: "fresh-secret" });
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [rowId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(rowId).toBe("tr-1");
    expect(newConfig.hookSecretEncrypted).toBe("enc(fresh-secret)");
    // Never stored in plaintext.
    expect(JSON.stringify(newConfig)).not.toContain('"fresh-secret"');
  });

  it("rejects a handshake against an ARMED row (secret already stored) — no overwrite, no echo", async () => {
    mockFind.mockResolvedValueOnce(triggerRow()); // armed row
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "attacker-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake_rejected", reason: "not_pending" });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("rejects a handshake with no matching trigger row", async () => {
    mockFind.mockResolvedValueOnce(null);
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });

  it("rejects a handshake without query params", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s", query: "" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "missing_query",
    });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("rejects an oversized handshake secret", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "x".repeat(300) }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "malformed_secret",
    });
  });

  it("rejects a handshake against a non-asana row", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ provider: "monday" }));
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });
});

describe("receiveAsanaWebhook — signature (events fail closed)", () => {
  it("throws InvalidSignatureError on a bad signature", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign("a different body") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the header is absent", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies with the ROW's own secret (a different webhook's secret fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body, "some-other-secret") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies over the RAW body bytes (re-serialized body fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = '{ "events": [] }';
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(reserialized, { sig: sign(body) }),
        rawBody: reserialized,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unverifiable (never dispatches) for a secretless row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ config: { projectId: "p-1", handshakePending: true } }),
    );
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unverifiable" });
  });
});

describe("receiveAsanaWebhook — routing + normalization", () => {
  it("returns unknown_workflow without query params / row / for foreign rows", async () => {
    const body = JSON.stringify({ events: [] });
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body), query: "" }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(null);
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(triggerRow({ provider: "trello" }));
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });
  });

  it("acks the 8h heartbeat (empty events) — verified but no dispatch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "heartbeat" });
  });

  it("normalizes a task-added event with the SHORT eventType + row-attributed project", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      provider: "asana",
      eventType: "new_task_in_project",
      eventId: "new_task_in_project:p-1:t-1",
      occurredAt: "2026-07-04T05:00:00.000Z",
      providerAccountId: "p-1",
      payload: {
        changeKind: "new_task_in_project",
        taskGid: "t-1",
        projectGid: "p-1",
        actorGid: "actor-1",
        action: "added",
        resourceSubtype: "default_task",
        createdAt: "2026-07-04T05:00:00.000Z",
      },
    });
    // The per-webhook secret never leaks into the normalized event.
    expect(JSON.stringify(result.events[0])).not.toContain(SECRET);
  });

  it("drops unsupported events (stories) and cross-type events (changed on a new_task row)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "new_task_in_project" }));
    const body = JSON.stringify({
      events: [
        taskEvent({ resource: { gid: "s-1", resource_type: "story" } }),
        taskEvent({ action: "changed" }),
        taskEvent({ action: "deleted" }),
        taskEvent(), // the only one that matches
      ],
    });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("new_task_in_project");
  });

  it("produces the SAME eventId for a redelivery (dedup determinism)", async () => {
    const body = JSON.stringify({ events: [taskEvent()] });
    mockFind.mockResolvedValue(triggerRow());
    const first = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    const second = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (first.kind !== "events" || second.kind !== "events") {
      throw new Error("expected events");
    }
    expect(first.events[0]!.eventId).toBe(second.events[0]!.eventId);
  });

  it("routes task-changed events on a task_updated row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "task_updated_in_project" }),
    );
    const body = JSON.stringify({ events: [taskEvent({ action: "changed" })] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventType).toBe("task_updated_in_project");
    expect(result.events[0]!.payload.changeKind).toBe("task_updated_in_project");
  });

  it("ASANA-1 rows never post-fetch (no integration lookup, no provider call)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

// ── ASANA-2: post-fetch enrichment paths ─────────────────────────────────

const fetchedTask = {
  gid: "t-1",
  name: "Fetched task",
  notes: null,
  completed: true,
  completed_at: "2026-07-06T09:00:00.000Z",
  due_on: null,
  due_at: null,
  assignee: { gid: "u-9", name: "Dana Assignee" },
  projects: [{ gid: "p-1" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-01T00:00:00.000Z",
  modified_at: "2026-07-06T09:00:00.000Z",
};

function changedEvent(field: string) {
  return taskEvent({
    action: "changed",
    change: { field, action: "changed" },
  });
}

describe("receiveAsanaWebhook — task_completed (ASANA-2)", () => {
  it("post-fetches the task and dispatches ONLY when completed === true", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockTasksGet.mockResolvedValueOnce(fetchedTask);
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("task_completed");
    expect(event.eventId).toBe("task_completed:p-1:t-1");
    expect(event.payload.taskName).toBe("Fetched task");
    expect(event.payload.completedAt).toBe("2026-07-06T09:00:00.000Z");
    expect(mockTasksGet).toHaveBeenCalledWith({
      accessToken: "access-token-123",
      taskGid: "t-1",
    });
    // The integration lookup used the ROW's workflow account.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-wf",
      "asana",
      null,
    );
    // No token/secret leaks into the dispatched event.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("access-token-123");
    expect(serialized).not.toContain(SECRET);
  });

  it("drops the event when the post-fetch shows the task is NOT completed (uncomplete race / spurious delivery)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, completed: false });
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-completed-field changes before any post-fetch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    const body = JSON.stringify({ events: [changedEvent("name")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockTasksGet).not.toHaveBeenCalled();
  });

  it("drops quietly when the task is gone (404 between event and fetch)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("task t-1", "gone"));
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops quietly when the credential is dead (action required) — never dispatch what we can't verify", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-wf",
        provider: "asana",
        providerAccountId: null,
        reason: "reauthorize",
      } as never),
    );
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("PROPAGATES unexpected post-fetch errors so the route 5xxes and Asana redelivers", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("Asana 500"));
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).rejects.toThrow("Asana 500");
  });

  it("drops quietly when the workflow account has no active Asana integration", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops quietly when the row has no workflowAccountId (legacy/corrupt row)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "task_completed", workflowAccountId: null }),
    );
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });
});

describe("receiveAsanaWebhook — task_assigned (ASANA-2)", () => {
  it("dispatches with the POST-FETCHED assignee (authoritative, not the compact event)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, completed: false });
    const body = JSON.stringify({ events: [changedEvent("assignee")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("task_assigned");
    expect(event.eventId).toBe("task_assigned:p-1:t-1:u-9");
    expect(event.payload.newAssigneeGid).toBe("u-9");
    expect(event.payload.newAssigneeName).toBe("Dana Assignee");
  });

  it("does NOT fire on unassignment (post-fetch shows no assignee)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, assignee: null });
    const body = JSON.stringify({ events: [changedEvent("assignee")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-assignee-field changes before any post-fetch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    const body = JSON.stringify({ events: [changedEvent("due_on")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockTasksGet).not.toHaveBeenCalled();
  });
});

describe("receiveAsanaWebhook — comment_added_to_task (ASANA-2)", () => {
  const storyEvent = taskEvent({
    resource: {
      gid: "s-77",
      resource_type: "story",
      resource_subtype: "comment_added",
    },
    parent: { gid: "t-1", resource_type: "task" },
    action: "added",
  });

  const fetchedStory = {
    gid: "s-77",
    text: "A comment body",
    resource_subtype: "comment_added",
    created_at: "2026-07-06T10:00:00.000Z",
    created_by: { gid: "u-3", name: "Casey Commenter" },
    target: { gid: "t-1" },
  };

  it("post-fetches the story (stories:read) and dispatches the bounded comment payload", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockStoriesGet.mockResolvedValueOnce(fetchedStory);
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("comment_added_to_task");
    expect(event.eventId).toBe("comment_added_to_task:p-1:s-77");
    expect(event.payload.commentText).toBe("A comment body");
    expect(event.payload.authorName).toBe("Casey Commenter");
    expect(event.payload.taskGid).toBe("t-1");
    expect(mockStoriesGet).toHaveBeenCalledWith({
      accessToken: "access-token-123",
      storyGid: "s-77",
    });
    // No token/secret leaks into the dispatched event.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("access-token-123");
    expect(serialized).not.toContain(SECRET);
  });

  it("drops when the post-fetched story is not a comment (defense-in-depth subtype check)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockStoriesGet.mockResolvedValueOnce({
      ...fetchedStory,
      resource_subtype: "assigned",
    });
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-comment story events before any post-fetch (subtype mismatch on the compact event)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    const notComment = taskEvent({
      resource: { gid: "s-80", resource_type: "story", resource_subtype: "assigned" },
      action: "added",
    });
    const body = JSON.stringify({ events: [notComment] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockStoriesGet).not.toHaveBeenCalled();
  });

  it("drops quietly when the story is gone (404)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("story s-77", "gone"));
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });
});
