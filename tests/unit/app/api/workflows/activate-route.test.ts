/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/activate/route.ts.
 *
 * Slice 3.SEC-4B introduced a destructive-action confirmation gate
 * before the route delegates to the lifecycle orchestrator. These
 * tests cover:
 *   - low-risk workflows still activate with an empty body
 *     (pre-SEC-4B contract preserved)
 *   - destructive workflows are blocked without confirmationText
 *   - correct confirmationText proceeds to orchestrator.activate
 *   - response shape on CONFIRMATION_REQUIRED is route-safe
 *
 * Mocks supabase auth at the createClient boundary, the workflows
 * repo (so the route's body-parsing path is exercised without a
 * Supabase fixture), and the orchestrator factory (so we never wire
 * the real trigger side-effects). The discovery registry runs for
 * real — pure module, no side effects.
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

const mockActivate = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ activate: mockActivate }),
}));

import { POST } from "@/app/api/workflows/[id]/activate/route";

const baseWorkflowRecord = {
  id: "wf-1",
  userId: "user-1",
  name: "WF",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: {
    nodes: [
      {
        id: "trigger-node",
        kind: "trigger" as const,
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      // Default: low-risk action so existing-shape activations pass.
      {
        id: "action-node",
        kind: "action" as const,
        provider: "gmail",
        type: "send_email",
        config: {},
        position: { x: 0, y: 100 },
      },
    ],
    edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
  },
  deletedAt: null,
  createdAt: "2026-05-16T00:00:00Z",
  updatedAt: "2026-05-16T00:00:00Z",
};

function activatedRecord() {
  return { ...baseWorkflowRecord, state: "active" as const };
}

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

function unsignedIn(): void {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function buildRequest(body?: string | null): Request {
  const headers = new Headers();
  if (body !== null && body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("content-length", String(Buffer.byteLength(body, "utf8")));
  }
  return new Request("http://localhost/api/workflows/wf-1/activate", {
    method: "POST",
    headers,
    body: body ?? undefined,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockActivate.mockReset();
  mockActivate.mockResolvedValue(activatedRecord());
});

// ── auth gate ───────────────────────────────────────────────────────────────

describe("POST /activate — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    unsignedIn();
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
  });
});

// ── body parsing ────────────────────────────────────────────────────────────

describe("POST /activate — body parsing", () => {
  beforeEach(() => signedInAs("user-1"));

  it("treats empty body as no confirmation supplied (pre-SEC-4B compat)", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(buildRequest(""), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("returns 400 on malformed JSON body", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(buildRequest("{not json"), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("returns 400 on unknown top-level key (strict envelope)", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(
      buildRequest(JSON.stringify({ unknownField: "x" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("returns 413 when content-length > 16 KiB", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("content-length", String(16 * 1024 + 1));
    const req = new Request("http://localhost/api/workflows/wf-1/activate", {
      method: "POST",
      headers,
      body: "{}",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(413);
    expect(mockActivate).not.toHaveBeenCalled();
  });
});

// ── low-risk workflow: no confirmation required ─────────────────────────────

describe("POST /activate — low-risk workflows (no confirmation required)", () => {
  beforeEach(() => signedInAs("user-1"));

  it("activates a workflow with no actions", async () => {
    mockGetById.mockResolvedValueOnce({
      ...baseWorkflowRecord,
      draftDefinition: {
        nodes: [
          baseWorkflowRecord.draftDefinition.nodes[0]!, // trigger only
        ],
        edges: [],
      },
    });
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("activates a low-risk workflow (gmail:send_email) with no confirmationText", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("ignores an unnecessary confirmationText on a low-risk workflow", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });
});

// ── destructive workflow: confirmation required ─────────────────────────────

const destructiveWorkflow = {
  ...baseWorkflowRecord,
  draftDefinition: {
    nodes: [
      baseWorkflowRecord.draftDefinition.nodes[0]!,
      {
        id: "refund-node",
        kind: "action" as const,
        provider: "stripe",
        type: "create_refund",
        config: {},
        position: { x: 0, y: 100 },
      },
    ],
    edges: [{ id: "e1", from: "trigger-node", to: "refund-node" }],
  },
};

describe("POST /activate — destructive workflows (Slice 3.SEC-4B)", () => {
  beforeEach(() => signedInAs("user-1"));

  it("returns 409 CONFIRMATION_REQUIRED when no confirmationText is provided", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    expect(mockActivate).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.error).toBe("CONFIRMATION_REQUIRED");
    expect(body.requiresConfirmation).toBe(true);
    expect(body.confirmationText).toBe("CONFIRM");
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].nodeId).toBe("refund-node");
    expect(body.actions[0].provider).toBe("stripe");
    expect(body.actions[0].type).toBe("create_refund");
    expect(body.actions[0].displayName).toBe("Create Refund");
    expect(typeof body.actions[0].riskDescription).toBe("string");
  });

  it("returns 409 when confirmationText is wrong (case mismatch)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "confirm" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(409);
    expect(mockActivate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBe("CONFIRMATION_REQUIRED");
  });

  it("returns 409 when confirmationText is wrong (different phrase)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "YES" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(409);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("proceeds when correct confirmationText is supplied", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("response does NOT include node config or workflow definition", async () => {
    mockGetById.mockResolvedValueOnce({
      ...destructiveWorkflow,
      draftDefinition: {
        ...destructiveWorkflow.draftDefinition,
        nodes: [
          destructiveWorkflow.draftDefinition.nodes[0]!,
          {
            id: "refund-node",
            kind: "action" as const,
            provider: "stripe",
            type: "create_refund",
            config: {
              chargeId: "ch_secret_1",
              metadata: { internal: "do-not-leak" },
            },
            position: { x: 0, y: 100 },
          },
        ],
      },
    });
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(text).not.toContain("ch_secret_1");
    expect(text).not.toContain("do-not-leak");
    expect(text).not.toContain("draftDefinition");
  });
});

// ── unknown / missing workflow defers to orchestrator ───────────────────────

describe("POST /activate — missing workflow defers to orchestrator's LifecycleError", () => {
  beforeEach(() => signedInAs("user-1"));

  it("when getById returns null, calls orchestrator and lets it surface 404", async () => {
    mockGetById.mockResolvedValueOnce(null);
    // The orchestrator throws WORKFLOW_NOT_FOUND which the route's
    // runLifecycle wrapper converts to 404. We mock the activate
    // call to simulate that path.
    const { LifecycleError } = await import("@/core/workflows/lifecycle");
    mockActivate.mockRejectedValueOnce(
      new LifecycleError("WORKFLOW_NOT_FOUND", "Workflow not found.", {
        workflowId: "wf-1",
      }),
    );
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("when workflow.state === 'deleted', skips risk check (orchestrator decides)", async () => {
    mockGetById.mockResolvedValueOnce({
      ...destructiveWorkflow,
      state: "deleted",
    });
    // No confirmationText, but workflow is deleted → confirmation
    // gate is skipped, orchestrator throws INVALID_TRANSITION.
    const { LifecycleError } = await import("@/core/workflows/lifecycle");
    mockActivate.mockRejectedValueOnce(
      new LifecycleError(
        "INVALID_TRANSITION",
        "Cannot activate from state 'deleted'.",
        { workflowId: "wf-1", currentState: "deleted" },
      ),
    );
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });
});
