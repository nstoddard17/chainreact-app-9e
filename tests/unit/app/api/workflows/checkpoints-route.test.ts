/**
 * @jest-environment node
 *
 * CHECKPOINTS-1 — /api/workflows/[id]/checkpoints (+ /[checkpointId]/restore).
 *
 * Business rules under test:
 *   - POST persists the client-supplied PRE-change draft as a react_agent
 *     checkpoint, with account_id + created_by_user_id set SERVER-side (never
 *     from the body).
 *   - GET lists the recent checkpoints for an account member.
 *   - Restore is blocked with a 404 no-leak for a non-member (and never writes).
 *   - A missing checkpoint surfaces a useful CHECKPOINT_NOT_FOUND 404.
 *   - A successful restore returns the workflow detail carrying the restored draft.
 *
 * The checkpoints SERVICE is mocked (its own unit test covers persistence +
 * restore semantics); these tests verify the route's auth gate, server-set
 * fields, and status/shape mapping.
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

const mockCreateCheckpoint = jest.fn();
const mockListCheckpoints = jest.fn();
const mockRestoreCheckpoint = jest.fn();
jest.mock("@/services/workflows/checkpoints", () => ({
  createCheckpoint: (...a: unknown[]) => mockCreateCheckpoint(...a),
  listCheckpoints: (...a: unknown[]) => mockListCheckpoints(...a),
  restoreCheckpoint: (...a: unknown[]) => mockRestoreCheckpoint(...a),
}));

import { GET, POST } from "@/app/api/workflows/[id]/checkpoints/route";
import { POST as RESTORE } from "@/app/api/workflows/[id]/checkpoints/[checkpointId]/restore/route";
import { LifecycleError } from "@/core/workflows/lifecycle";

const PRE_CHANGE = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};

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
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/workflows/wf-1/checkpoints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "wf-1" });
const restoreParams = Promise.resolve({ id: "wf-1", checkpointId: "cp-1" });

beforeEach(() => {
  jest.clearAllMocks();
  signedInAs("user-1");
  mockGetById.mockResolvedValue(baseWorkflow);
  mockIsMember.mockResolvedValue(true);
});

describe("POST /api/workflows/[id]/checkpoints", () => {
  it("persists the supplied pre-change draft as a react_agent checkpoint with server-set account + actor", async () => {
    mockCreateCheckpoint.mockResolvedValue({
      id: "cp-1", workflowId: "wf-1", source: "react_agent", name: "Before React Agent change",
      prompt: "change slack to gmail", summary: "Removed Slack; Added Gmail.",
      createdByUserId: "user-1", createdAt: "2026-07-15T01:00:00Z",
    });

    const res = await POST(
      jsonRequest({
        definition: PRE_CHANGE,
        source: "react_agent",
        name: "Before React Agent change",
        prompt: "change slack to gmail",
        summary: "Removed Slack; Added Gmail.",
        // A spoofed accountId/createdByUserId in the body must be IGNORED.
        accountId: "acct-attacker",
        createdByUserId: "user-attacker",
      }),
      { params },
    );

    expect(res.status).toBe(201);
    expect(mockCreateCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        accountId: "acct-1", // from the loaded workflow, NOT the body
        createdByUserId: "user-1", // from auth, NOT the body
        source: "react_agent",
        name: "Before React Agent change",
        prompt: "change slack to gmail",
        summary: "Removed Slack; Added Gmail.",
        definition: PRE_CHANGE,
      }),
    );
  });

  it("returns 401 and never creates when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(jsonRequest({ definition: PRE_CHANGE, source: "react_agent", name: "x" }), { params });
    expect(res.status).toBe(401);
    expect(mockCreateCheckpoint).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid source and never creates", async () => {
    const res = await POST(jsonRequest({ definition: PRE_CHANGE, source: "totally_bogus", name: "x" }), { params });
    expect(res.status).toBe(400);
    expect(mockCreateCheckpoint).not.toHaveBeenCalled();
  });

  it("returns 404 (no existence leak) and never creates when the caller is not an account member", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await POST(jsonRequest({ definition: PRE_CHANGE, source: "react_agent", name: "x" }), { params });
    expect(res.status).toBe(404);
    expect(mockCreateCheckpoint).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflows/[id]/checkpoints", () => {
  it("returns the recent checkpoints for an account member", async () => {
    mockListCheckpoints.mockResolvedValue([
      { id: "cp-1", workflowId: "wf-1", source: "react_agent", name: "Before React Agent change", prompt: "p", summary: "s", createdByUserId: "user-1", createdAt: "2026-07-15T01:00:00Z" },
    ]);
    const res = await GET(new Request("http://localhost/api/workflows/wf-1/checkpoints"), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkpoints: unknown[] };
    expect(body.checkpoints).toHaveLength(1);
  });
});

describe("POST /api/workflows/[id]/checkpoints/[checkpointId]/restore", () => {
  it("is blocked with a 404 no-leak for a non-member and never restores", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await RESTORE(new Request("http://localhost/r", { method: "POST" }), { params: restoreParams });
    expect(res.status).toBe(404);
    expect(mockRestoreCheckpoint).not.toHaveBeenCalled();
  });

  it("surfaces CHECKPOINT_NOT_FOUND (404) with a useful message when the checkpoint is missing", async () => {
    mockRestoreCheckpoint.mockResolvedValue({ ok: false, reason: "checkpoint_not_found" });
    const res = await RESTORE(new Request("http://localhost/r", { method: "POST" }), { params: restoreParams });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("CHECKPOINT_NOT_FOUND");
    expect(body.error).toMatch(/checkpoint/i);
  });

  it("returns the workflow detail carrying the restored draft on success", async () => {
    const restored = {
      ...baseWorkflow,
      draftDefinition: PRE_CHANGE,
      updatedAt: "2026-07-15T03:00:00Z",
    };
    mockRestoreCheckpoint.mockResolvedValue({ ok: true, record: restored });
    const res = await RESTORE(new Request("http://localhost/r", { method: "POST" }), { params: restoreParams });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { draftDefinition: typeof PRE_CHANGE; updatedAt: string };
    expect(body.draftDefinition).toEqual(PRE_CHANGE);
    expect(body.updatedAt).toBe("2026-07-15T03:00:00Z");
    expect(mockRestoreCheckpoint).toHaveBeenCalledWith({
      workflow: baseWorkflow,
      checkpointId: "cp-1",
    });
  });

  // Restoring an older draft over an ACTIVE workflow can change the activatable trigger set; the
  // shared save path then tears down the registration via the lifecycle orchestrator, which can
  // throw a typed LifecycleError. The route must MAP it (typed 4xx), never let it escape as a 500.
  it("maps a thrown LifecycleError to its typed lifecycle response (not an uncaught 500)", async () => {
    mockRestoreCheckpoint.mockRejectedValue(
      new LifecycleError("LIFECYCLE_CONFLICT", "another lifecycle op is in progress"),
    );
    const res = await RESTORE(new Request("http://localhost/r", { method: "POST" }), { params: restoreParams });
    expect(res.status).toBe(409); // LIFECYCLE_CONFLICT → 409
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("LIFECYCLE_CONFLICT");
  });

  // Any OTHER throw (DB error, credential-plan read, etc.) must surface as a stable, safe body —
  // NEVER a raw 500 echoing the internal message/stack.
  it("returns a safe CHECKPOINT_RESTORE_FAILED body for an unexpected throw, without leaking the internal message", async () => {
    const rawSecret = "workflows.updateDraftDefinition failed: relation account_secrets violated constraint xyz";
    mockRestoreCheckpoint.mockRejectedValue(new Error(rawSecret));
    const res = await RESTORE(new Request("http://localhost/r", { method: "POST" }), { params: restoreParams });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("CHECKPOINT_RESTORE_FAILED");
    expect(body.error).toBe("Couldn't restore this checkpoint. Refresh and try again.");
    // The raw internal message never reaches the client.
    expect(JSON.stringify(body)).not.toContain("updateDraftDefinition");
    expect(JSON.stringify(body)).not.toContain("account_secrets");
  });
});
