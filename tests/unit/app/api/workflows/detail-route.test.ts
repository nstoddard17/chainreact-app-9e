/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/route.ts.
 *
 * Verifies the non-trivial route logic: 404 mapping for missing-or-deleted
 * rows, the no-op when PATCH name is unchanged, and the success path.
 *
 * Mocks supabase + repository so the test never touches the network or DB.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
const mockUpdateName = jest.fn();
// WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the route writes through
// the canonical guarded compare-and-swap; there is no unguarded writer.
const mockUpdateDraftDefinition = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
  updateName: (...args: unknown[]) => mockUpdateName(...args),
  updateDraftDefinitionIfRevisionMatches: (...args: unknown[]) =>
    mockUpdateDraftDefinition(...args),
}));

/** The revision the client loaded — matches baseRecord.updatedAt. */
const REV = "2026-05-06T00:00:00Z";

// 4.TEAM-WORKFLOWS-1 (TW-1): the route now authorizes by account membership.
const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

// Active-edit stale-trigger fix: a trigger change on an active workflow deactivates it via
// the existing orchestrator. Mock the factory so the test asserts the disable call without
// standing up the trigger registry. (triggerChanged itself runs for real — it's pure.)
const mockDisable = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ disable: (...a: unknown[]) => mockDisable(...a) }),
}));

import { GET, PATCH } from "@/app/api/workflows/[id]/route";

const slackTrigger = {
  id: "t1",
  kind: "trigger",
  provider: "slack",
  type: "message_received",
  config: { channel: "C1" },
  position: { x: 0, y: 0 },
};
const defWith = (over: Partial<typeof slackTrigger> = {}) => ({
  nodes: [{ ...slackTrigger, ...over }],
  edges: [],
});

const baseRecord = {
  id: "wf-1",
  userId: "user-1",
  // WF-RUNPERM: caller "user-1" is the creator, so edits to credential-bound
  // definitions (incl. adding a gmail node) are allowed.
  createdByUserId: "user-1",
  accountId: "acct-user-1",
  name: "Original",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-06T00:00:00Z",
  updatedAt: "2026-05-06T00:00:00Z",
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockUpdateName.mockReset();
  mockUpdateDraftDefinition.mockReset();
  mockDisable.mockReset();
  // Default: caller is a member of the workflow's account. The cross-account
  // tests override this to false.
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

describe("GET /api/workflows/[id]", () => {
  it("returns the WorkflowDetail when the row exists and is not deleted", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "wf-1",
      name: "Original",
      state: "draft",
      activeRevisionId: null,
      draftDefinition: { nodes: [], edges: [] },
    });
    expect(body).not.toHaveProperty("userId");
  });

  it("returns 404 (WORKFLOW_NOT_FOUND) when getById returns null", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("returns 404 even when the row exists but state === 'deleted' (soft-delete is hidden)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({
      ...baseRecord,
      state: "deleted",
      deletedAt: "2026-05-06T01:00:00Z",
    });
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 when no user is signed in", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  // 4.TEAM-WORKFLOWS-1 (TW-1) — account-membership authorization.
  it("returns 404 (no existence leak) when the caller is NOT a member of the workflow's account", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-B" });
    mockIsMember.mockResolvedValueOnce(false); // caller not a member of acct-team-B
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockIsMember).toHaveBeenCalledWith("user-1", "acct-team-B");
  });

  it("returns the detail when the caller IS a member of the workflow's account", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-A" });
    mockIsMember.mockResolvedValueOnce(true);
    const res = await GET(new Request("http://x/wf-1"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockIsMember).toHaveBeenCalledWith("user-1", "acct-team-A");
  });
});

describe("PATCH /api/workflows/[id]", () => {
  function patchRequest(body: unknown): Request {
    return new Request("http://x/wf-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates the name and returns the updated detail", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    mockUpdateName.mockResolvedValueOnce({ ...baseRecord, name: "Renamed" });
    const res = await PATCH(patchRequest({ name: "Renamed" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateName).toHaveBeenCalledWith("wf-1", "Renamed");
    const body = await res.json();
    expect(body.name).toBe("Renamed");
  });

  it("skips updateName when the name is unchanged (no-op write)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    const res = await PATCH(patchRequest({ name: "Original" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateName).not.toHaveBeenCalled();
  });

  it("returns 404 when the workflow is deleted (PATCH must mirror GET's 404)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, state: "deleted" });
    const res = await PATCH(patchRequest({ name: "Renamed" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockUpdateName).not.toHaveBeenCalled();
  });

  it("returns 400 with the schema error when name is empty", async () => {
    authedUser();
    const res = await PATCH(patchRequest({ name: "" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has no editable fields", async () => {
    authedUser();
    const res = await PATCH(patchRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("writes a valid draftDefinition via the repository", async () => {
    const validDef = {
      nodes: [
        {
          id: "n1",
          kind: "trigger",
          provider: "slack",
          type: "message_received",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    mockUpdateDraftDefinition.mockResolvedValueOnce({
      ...baseRecord,
      draftDefinition: validDef,
    });
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: validDef }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateDraftDefinition).toHaveBeenCalledWith({
      accountId: "acct-user-1",
      workflowId: "wf-1",
      draftDefinition: expect.objectContaining({ nodes: expect.any(Array), edges: [] }),
      expectedUpdatedAt: REV,
    });
    const body = await res.json();
    expect(body.draftDefinition.nodes[0].id).toBe("n1");
  });

  it("rejects an invalid draftDefinition (e.g. duplicate-trigger) with 400", async () => {
    authedUser();
    const trigger = {
      id: "n1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: {},
      position: { x: 0, y: 0 },
    };
    const res = await PATCH(
      patchRequest({
        expectedRevision: REV,
        draftDefinition: {
          nodes: [trigger, { ...trigger, id: "n2" }],
          edges: [],
        },
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  // 4.TEAM-WORKFLOWS-1 (TW-1) — account-membership authorization on PATCH.
  it("returns 404 and does NOT write when the caller is not a member of the workflow's account", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, accountId: "acct-team-B" });
    mockIsMember.mockResolvedValueOnce(false);
    const res = await PATCH(patchRequest({ name: "Renamed" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockUpdateName).not.toHaveBeenCalled();
  });

  it("applies both name and draftDefinition in a single PATCH", async () => {
    const validDef = { nodes: [], edges: [] };
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    mockUpdateName.mockResolvedValueOnce({ ...baseRecord, name: "Renamed" });
    mockUpdateDraftDefinition.mockResolvedValueOnce({
      ...baseRecord,
      name: "Renamed",
      draftDefinition: validDef,
    });
    const res = await PATCH(
      patchRequest({ name: "Renamed", expectedRevision: REV, draftDefinition: validDef }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockUpdateName).toHaveBeenCalledWith("wf-1", "Renamed");
    expect(mockUpdateDraftDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", draftDefinition: validDef, expectedUpdatedAt: REV }),
    );
  });
});

describe("PATCH /api/workflows/[id] — active-edit stale-trigger deactivation", () => {
  function patchRequest(body: unknown): Request {
    return new Request("http://x/wf-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const params = { params: Promise.resolve({ id: "wf-1" }) };
  // An ACTIVE workflow whose previous draft has a Slack trigger on channel C1.
  const activeRecord = { ...baseRecord, state: "active" as const, draftDefinition: defWith() };

  it("active + trigger CONFIG change → writes draft then disables (reason/context); response is disabled, no id leak", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(activeRecord);
    const newDef = defWith({ config: { channel: "C2" } });
    mockUpdateDraftDefinition.mockResolvedValueOnce({ ...activeRecord, draftDefinition: newDef });
    mockDisable.mockResolvedValueOnce({
      ...activeRecord,
      state: "disabled",
      disabledReason: "manual_admin",
      disabledContext: "Trigger changed — reconnect and reactivate.",
      draftDefinition: newDef,
    });

    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: newDef }), params);
    expect(res.status).toBe(200);
    // Draft written BEFORE disable.
    expect(mockUpdateDraftDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", draftDefinition: newDef, expectedUpdatedAt: REV }),
    );
    expect(mockDisable).toHaveBeenCalledWith({
      workflowId: "wf-1",
      reason: "manual_admin",
      context: "Trigger changed — reconnect and reactivate.",
    });
    const body = await res.json();
    expect(body.state).toBe("disabled");
    // toWorkflowDetail must not surface account / creator ids.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("acct-user-1");
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("createdByUserId");
  });

  it("active + trigger PROVIDER change → disables", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(activeRecord);
    const newDef = defWith({ provider: "gmail", type: "new_email" });
    mockUpdateDraftDefinition.mockResolvedValueOnce({ ...activeRecord, draftDefinition: newDef });
    mockDisable.mockResolvedValueOnce({ ...activeRecord, state: "disabled", draftDefinition: newDef });
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: newDef }), params);
    expect(res.status).toBe(200);
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });

  it("active + trigger REMOVED → disables", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(activeRecord);
    const newDef = { nodes: [], edges: [] };
    mockUpdateDraftDefinition.mockResolvedValueOnce({ ...activeRecord, draftDefinition: newDef });
    mockDisable.mockResolvedValueOnce({ ...activeRecord, state: "disabled", draftDefinition: newDef });
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: newDef }), params);
    expect(res.status).toBe(200);
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });

  it("active + MANUAL trigger (native:manual.run) change → does NOT deactivate (manual isn't activatable)", async () => {
    authedUser();
    const manual = (config: Record<string, unknown>) => ({
      nodes: [{ id: "t1", kind: "trigger", provider: "native", type: "manual.run", config, position: { x: 0, y: 0 } }],
      edges: [],
    });
    mockGetById.mockResolvedValueOnce({ ...baseRecord, state: "active", draftDefinition: manual({ a: 1 }) });
    mockUpdateDraftDefinition.mockResolvedValueOnce({ ...baseRecord, state: "active", draftDefinition: manual({ a: 2 }) });
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: manual({ a: 2 }) }), params);
    expect(res.status).toBe(200);
    expect(mockDisable).not.toHaveBeenCalled();
    expect((await res.json()).state).toBe("active");
  });

  it("active + ACTION-ONLY change (trigger untouched) → stays active, NO disable", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(activeRecord);
    // Same trigger, plus a new action node.
    const newDef = {
      nodes: [
        { ...slackTrigger },
        { id: "a1", kind: "action", provider: "slack", type: "post_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    };
    mockUpdateDraftDefinition.mockResolvedValueOnce({ ...activeRecord, draftDefinition: newDef });
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: newDef }), params);
    expect(res.status).toBe(200);
    expect(mockUpdateDraftDefinition).toHaveBeenCalledTimes(1);
    expect(mockDisable).not.toHaveBeenCalled();
    expect((await res.json()).state).toBe("active");
  });

  it.each(["draft", "paused", "disabled", "eligible_to_resume"] as const)(
    "%s + trigger change → NO disable (not actively dispatching)",
    async (state) => {
      authedUser();
      mockGetById.mockResolvedValueOnce({ ...baseRecord, state, draftDefinition: defWith() });
      const newDef = defWith({ config: { channel: "C2" } });
      mockUpdateDraftDefinition.mockResolvedValueOnce({ ...baseRecord, state, draftDefinition: newDef });
      const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: newDef }), params);
      expect(res.status).toBe(200);
      expect(mockDisable).not.toHaveBeenCalled();
    },
  );

  it("non-member with a trigger change → 404, NO write, NO disable", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...activeRecord, accountId: "acct-team-B" });
    mockIsMember.mockResolvedValueOnce(false);
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: defWith({ config: { channel: "C2" } }) }), params);
    expect(res.status).toBe(404);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("invalid definition on an active workflow → 400, NO write, NO disable", async () => {
    authedUser();
    // Two triggers → fails WorkflowDefinitionSchema at parse, before any load/write.
    const invalid = { nodes: [{ ...slackTrigger }, { ...slackTrigger, id: "t2" }], edges: [] };
    const res = await PATCH(patchRequest({ expectedRevision: REV, draftDefinition: invalid }), params);
    expect(res.status).toBe(400);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });
});

// WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — optimistic concurrency on
// the interactive builder save.
describe("PATCH /api/workflows/[id] — revision conflict protection", () => {
  function patchRequest(body: unknown): Request {
    return new Request("http://x/wf-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const params = { params: Promise.resolve({ id: "wf-1" }) };
  const validDef = { nodes: [], edges: [] };

  it("requires expectedRevision for interactive builder saves (400, nothing loaded or written)", async () => {
    authedUser();
    const res = await PATCH(patchRequest({ draftDefinition: validDef }), params);
    expect(res.status).toBe(400);
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("returns typed 409 WORKFLOW_REVISION_CONFLICT when the loaded row already moved past expectedRevision (read-time), with NO write and NO lifecycle side effect", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, updatedAt: "2026-05-07T00:00:00Z" });
    const res = await PATCH(
      patchRequest({ expectedRevision: REV, draftDefinition: validDef }),
      params,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_REVISION_CONFLICT");
    expect(body.latestRevision).toBe("2026-05-07T00:00:00Z");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("classifies a write-time compare-and-swap miss as 409 with the CURRENT server revision; newer definition unchanged", async () => {
    authedUser();
    // Read-time check passes (row matches the client token)…
    mockGetById.mockResolvedValueOnce(baseRecord);
    // …but the CAS misses (another writer landed between read and UPDATE).
    mockUpdateDraftDefinition.mockResolvedValueOnce(null);
    // The classify re-read reports the newer revision.
    mockGetById.mockResolvedValueOnce({ ...baseRecord, updatedAt: "2026-05-08T00:00:00Z" });
    const res = await PATCH(
      patchRequest({ expectedRevision: REV, draftDefinition: validDef }),
      params,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_REVISION_CONFLICT");
    expect(body.latestRevision).toBe("2026-05-08T00:00:00Z");
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("conflict response carries NO workflow definition or account/creator identifiers", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({
      ...baseRecord,
      updatedAt: "2026-05-07T00:00:00Z",
      draftDefinition: defWith({ config: { channel: "SECRET-CHANNEL" } }),
    });
    const res = await PATCH(
      patchRequest({ expectedRevision: REV, draftDefinition: validDef }),
      params,
    );
    expect(res.status).toBe(409);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("draftDefinition");
    expect(raw).not.toContain("SECRET-CHANNEL");
    expect(raw).not.toContain("acct-user-1");
    expect(raw).not.toContain("user-1");
  });

  it("classifies a CAS miss on a row that vanished as 404 (not a conflict)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(baseRecord);
    mockUpdateDraftDefinition.mockResolvedValueOnce(null);
    mockGetById.mockResolvedValueOnce(null); // gone by classify time
    const res = await PATCH(
      patchRequest({ expectedRevision: REV, draftDefinition: validDef }),
      params,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
  });
});
