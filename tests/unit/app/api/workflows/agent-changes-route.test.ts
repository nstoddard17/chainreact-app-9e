/**
 * @jest-environment node
 *
 * AGENT-CHANGE-HISTORY-1 — /api/workflows/[id]/agent-changes.
 *
 * Business rules under test:
 *   - POST records one agent change with account_id + created_by_user_id set
 *     SERVER-side (never from the body), returning 201.
 *   - GET lists recent changes for an account member.
 *   - A non-member gets the standard 404 no-leak and NOTHING is recorded/listed.
 *   - Unauthenticated → 401, never records.
 *   - An invalid status → 400, never records.
 *
 * The history SERVICE is mocked (its own unit test covers create/transition
 * semantics); these tests verify the route's auth gate, server-set fields, and
 * status/shape mapping — mirroring the checkpoints route test.
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

const mockRecord = jest.fn();
const mockList = jest.fn();
jest.mock("@/services/workflows/agentChangeHistory", () => ({
  recordAgentChange: (...a: unknown[]) => mockRecord(...a),
  listAgentChanges: (...a: unknown[]) => mockList(...a),
}));

import { GET, POST } from "@/app/api/workflows/[id]/agent-changes/route";

const CHANGE_ID = "11111111-1111-4111-8111-111111111111";

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

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/workflows/wf-1/agent-changes", {
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
});

describe("POST /api/workflows/[id]/agent-changes", () => {
  it("records the change with server-set account + actor (ignoring any spoofed body fields)", async () => {
    mockRecord.mockResolvedValue({ id: "row-1", agentChangeId: CHANGE_ID, status: "preview_created" });
    const res = await POST(
      jsonRequest({
        agentChangeId: CHANGE_ID,
        status: "preview_created",
        prompt: "change slack to gmail",
        addedNodeCount: 1,
        // spoofed ids must be ignored — the route sets these from auth/workflow.
        accountId: "acct-attacker",
        createdByUserId: "user-attacker",
      }),
      { params },
    );
    expect(res.status).toBe(201);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        accountId: "acct-1", // from the loaded workflow, NOT the body
        createdByUserId: "user-1", // from auth, NOT the body
        request: expect.objectContaining({ agentChangeId: CHANGE_ID, status: "preview_created" }),
      }),
    );
  });

  it("returns 401 and never records when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(jsonRequest({ agentChangeId: CHANGE_ID, status: "preview_created" }), { params });
    expect(res.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status and never records", async () => {
    const res = await POST(jsonRequest({ agentChangeId: CHANGE_ID, status: "totally_bogus" }), { params });
    expect(res.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("returns 404 (no existence leak) and never records when the caller is not an account member", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await POST(jsonRequest({ agentChangeId: CHANGE_ID, status: "preview_created" }), { params });
    expect(res.status).toBe(404);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflows/[id]/agent-changes", () => {
  it("returns the recent change history for an account member", async () => {
    mockList.mockResolvedValue([
      { id: "row-1", agentChangeId: CHANGE_ID, status: "preview_applied" },
    ]);
    const res = await GET(new Request("http://localhost/api/workflows/wf-1/agent-changes"), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("returns 404 (no existence leak) and never lists for a non-member", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await GET(new Request("http://localhost/api/workflows/wf-1/agent-changes"), { params });
    expect(res.status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
  });
});
