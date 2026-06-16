/**
 * @jest-environment node
 *
 * Route-level regression for POST /api/workflows/[id]/publish (V2-READY-41G;
 * release-gate coverage added in V2-READY-41J).
 *
 * Publish is the newest active-revision operation and had only orchestrator-level
 * coverage (lifecycleOrchestrator.test.ts). These tests pin the ROUTE contract:
 *   - non-member → standard 404 (no existence leak), orchestrator never called;
 *   - WF-RUNPERM — publishing makes the current draft live, so a non-creator may
 *     NOT publish a private-credential workflow (403), orchestrator never called;
 *   - creator + member happy path → 200 + summary, orch.publish(id) called;
 *   - publishing a non-active workflow → the orchestrator's INVALID_TRANSITION
 *     LifecycleError maps to 409 via runLifecycle.
 *
 * Mocks supabase auth, the workflows repo (getById), accountMemberships
 * (isMember), and the orchestrator factory. `assertWorkflowRunEditAllowed`
 * runs for real — with connection-sharing OFF (default) it reduces to the
 * conservative creator-only `viewerMayRunEdit`, so the gmail node in the fixture
 * makes the draft creator-only without any credential-plan mocks.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

const mockPublish = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ publish: mockPublish }),
}));

import { POST } from "@/app/api/workflows/[id]/publish/route";

// gmail action ⇒ a private-credential draft ⇒ WF-RUNPERM makes it creator-only.
const baseRecord = {
  id: "wf-1",
  accountId: "acct-A",
  createdByUserId: "creator-1",
  name: "WF",
  state: "active" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: "rev-1",
  draftDefinition: {
    nodes: [
      {
        id: "t1",
        kind: "trigger" as const,
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "a1",
        kind: "action" as const,
        provider: "gmail",
        type: "send_email",
        config: { to: "ops@example.com" },
        position: { x: 0, y: 100 },
      },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  },
  deletedAt: null,
  createdAt: "2026-06-26T00:00:00Z",
  updatedAt: "2026-06-26T00:00:00Z",
};

function authedAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

const params = { params: Promise.resolve({ id: "wf-1" }) };
const req = () =>
  new Request("http://x/api/workflows/wf-1/publish", { method: "POST" });

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockIsMember.mockReset();
  mockPublish.mockReset();
});

describe("POST /api/workflows/[id]/publish (V2-READY-41G route contract)", () => {
  it("non-member → 404 WORKFLOW_NOT_FOUND, orchestrator never called (no existence leak)", async () => {
    authedAs("outsider-1");
    mockGetById.mockResolvedValue({ ...baseRecord, accountId: "acct-OTHER" });
    mockIsMember.mockResolvedValueOnce(false);

    const res = await POST(req(), params);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockIsMember).toHaveBeenCalledWith("outsider-1", "acct-OTHER");
  });

  it("WF-RUNPERM: a non-creator member cannot publish a private-credential workflow (403), orchestrator never called", async () => {
    authedAs("member-2"); // member of the account, but NOT the workflow creator
    mockGetById.mockResolvedValue(baseRecord);
    mockIsMember.mockResolvedValue(true);

    const res = await POST(req(), params);

    expect(res.status).toBe(403);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("creator + member → 200, calls orch.publish(id), returns the workflow summary", async () => {
    authedAs("creator-1");
    mockGetById.mockResolvedValue(baseRecord);
    mockIsMember.mockResolvedValue(true);
    mockPublish.mockResolvedValueOnce({ ...baseRecord, activeRevisionId: "rev-2" });

    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(mockPublish).toHaveBeenCalledWith("wf-1");
    const body = await res.json();
    expect(body.id).toBe("wf-1");
    expect(body.state).toBe("active");
    // Summary is definition-free — never leaks the draft/revision graph.
    expect(body).not.toHaveProperty("draftDefinition");
  });

  it("publishing a non-active workflow → 409 INVALID_TRANSITION (LifecycleError mapped by runLifecycle)", async () => {
    authedAs("creator-1");
    mockGetById.mockResolvedValue({ ...baseRecord, state: "paused" });
    mockIsMember.mockResolvedValue(true);
    const { LifecycleError } = await import("@/core/workflows/lifecycle");
    mockPublish.mockRejectedValueOnce(
      new LifecycleError(
        "INVALID_TRANSITION",
        "Only an active workflow can publish draft changes.",
        { state: "paused" },
      ),
    );

    const res = await POST(req(), params);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_TRANSITION");
  });

  it("unauthenticated → 401, orchestrator never called", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(req(), params);

    expect(res.status).toBe(401);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
