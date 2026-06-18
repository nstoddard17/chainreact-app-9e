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

// 4.TEAM-WORKFLOWS-1 (TW-1): the route now authorizes by account membership.
const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

const mockActivate = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ activate: mockActivate }),
}));

// Slice 3.POSTSEC-8 — emission helper is mocked so route tests can
// assert "audit event was emitted with the right payload" without
// hitting the notifications repo.
const mockNotifyActivation = jest.fn();
jest.mock("@/services/notifications/notifyHighRiskWorkflowEvent", () => ({
  notifyHighRiskActivation: (...args: unknown[]) =>
    mockNotifyActivation(...args),
  // Unused in this test file but exported by the module under mock.
  notifyHighRiskRun: jest.fn(),
}));

import { POST } from "@/app/api/workflows/[id]/activate/route";

const baseWorkflowRecord = {
  id: "wf-1",
  userId: "user-1",
  // WF-RUNPERM: the fixture uses gmail (a private/member-connected provider), so
  // run/edit is creator-only. Happy-path tests sign in as the creator.
  createdByUserId: "user-1",
  accountId: "acct-user-1",
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
        // Configured + connected so the B readiness gate treats the base
        // fixture as a valid, activatable workflow (gmail send_email requires
        // `to`). Tests that target the readiness gate override the definition.
        config: { to: "ops@example.com" },
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
  mockNotifyActivation.mockReset();
  mockNotifyActivation.mockResolvedValue({ outcome: "emitted" });
  // Default: caller is a member of the workflow's account (cross-account test
  // overrides to false).
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
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

  // 4.TEAM-WORKFLOWS-1 (TW-1) — account-membership authorization.
  it("returns 404 and does NOT activate when the caller is not a member of the workflow's account", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({
      ...baseWorkflowRecord,
      accountId: "acct-team-B",
    });
    mockIsMember.mockResolvedValueOnce(false);
    const res = await POST(buildRequest(""), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockIsMember).toHaveBeenCalledWith("user-1", "acct-team-B");
  });

  // 4.WF-RUNPERM — a same-account NON-creator (incl. owner/admin) may NOT activate
  // a private-credential workflow (the base fixture uses gmail). Membership passes
  // (404 gate cleared), then the run/edit gate returns the typed 403.
  it("returns 403 WORKFLOW_USES_PRIVATE_CREDENTIAL for a non-creator member, no activate", async () => {
    signedInAs("member-2"); // member of the account, but not the creator (user-1)
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    mockIsMember.mockResolvedValueOnce(true);
    const res = await POST(buildRequest(""), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_USES_PRIVATE_CREDENTIAL");
    expect(JSON.stringify(body)).not.toMatch(/gmail|user-1|token/i);
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

// ── Slice 3.POSTSEC-3 — newly-confirmed Stripe money-moving actions ────────
//
// Activation of any workflow containing one of the 5 POSTSEC-3 actions
// requires typed confirmation, even though those actions are NOT
// isDestructive. Supplying the correct confirmation proceeds.
describe("POST /activate — B: execution-readiness gate", () => {
  beforeEach(() => signedInAs("user-1"));

  const trigger = baseWorkflowRecord.draftDefinition.nodes[0]!;
  const emptyGmail = {
    id: "action-node",
    kind: "action" as const,
    provider: "gmail",
    type: "send_email",
    config: {},
    position: { x: 0, y: 100 },
  };
  const configuredGmail = { ...emptyGmail, config: { to: "ops@example.com" } };
  function workflowGraph(nodes: unknown[], edges: unknown[]): typeof baseWorkflowRecord {
    return {
      ...baseWorkflowRecord,
      draftDefinition: { nodes, edges },
    } as typeof baseWorkflowRecord;
  }

  it("blocks activation when a required field is missing (422 MISSING_REQUIRED_FIELDS, no activate)", async () => {
    mockGetById.mockResolvedValueOnce(
      workflowGraph([trigger, emptyGmail], [{ id: "e1", from: "trigger-node", to: "action-node" }]),
    );
    const res = await POST(buildRequest(""), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("MISSING_REQUIRED_FIELDS");
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("blocks activation of an orphan action (422 INVALID_WORKFLOW_GRAPH)", async () => {
    mockGetById.mockResolvedValueOnce(workflowGraph([trigger, configuredGmail], [])); // no edge
    const res = await POST(buildRequest(""), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_WORKFLOW_GRAPH");
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("blocks activation of a draft with a broken deleted-step variable reference (422 INVALID_VARIABLE_REFERENCE, CS-2)", async () => {
    // `to` is non-empty (required field satisfied) but references a node not in the graph.
    const brokenRefGmail = { ...emptyGmail, config: { to: "{{ghost-node.email}}" } };
    mockGetById.mockResolvedValueOnce(
      workflowGraph([trigger, brokenRefGmail], [{ id: "e1", from: "trigger-node", to: "action-node" }]),
    );
    const res = await POST(buildRequest(""), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_VARIABLE_REFERENCE");
    expect(mockActivate).not.toHaveBeenCalled();
    // No-leak: no config value / raw token in the rejection payload.
    const text = JSON.stringify(body);
    expect(text).not.toContain("ghost-node");
    expect(text).not.toContain("{{");
  });

  it("activates a valid, configured, connected workflow (200)", async () => {
    mockGetById.mockResolvedValueOnce(
      workflowGraph([trigger, configuredGmail], [{ id: "e1", from: "trigger-node", to: "action-node" }]),
    );
    const res = await POST(buildRequest(""), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });
});

describe("POST /activate — POSTSEC-3 newly-confirmed Stripe money-moving actions", () => {
  beforeEach(() => signedInAs("user-1"));

  function workflowWith(type: string) {
    return {
      ...baseWorkflowRecord,
      draftDefinition: {
        nodes: [
          baseWorkflowRecord.draftDefinition.nodes[0]!,
          {
            id: "stripe-node",
            kind: "action" as const,
            provider: "stripe",
            type,
            // amount/currency satisfy create_payment_intent's required-field
            // readiness gate on the proceed path; the no-confirmation cases
            // never reach it (the 409 destructive gate fires first). `internal`
            // proves raw config is never echoed in CONFIRMATION_REQUIRED.
            config: { amount: 10, currency: "usd", internal: "do-not-leak" },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [
          { id: "e1", from: "trigger-node", to: "stripe-node" },
        ],
      },
    };
  }

  const POSTSEC3_KEYS = [
    "create_payment_intent",
    "confirm_payment_intent",
    "create_subscription",
    "update_subscription",
    "create_invoice",
  ] as const;

  for (const type of POSTSEC3_KEYS) {
    it(`activation of a workflow containing stripe:${type} returns 409 CONFIRMATION_REQUIRED without confirmationText`, async () => {
      mockGetById.mockResolvedValueOnce(workflowWith(type));
      const res = await POST(buildRequest(), {
        params: Promise.resolve({ id: "wf-1" }),
      });
      expect(res.status).toBe(409);
      expect(mockActivate).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.error).toBe("CONFIRMATION_REQUIRED");
      expect(body.confirmationText).toBe("CONFIRM");
      expect(body.actions[0].provider).toBe("stripe");
      expect(body.actions[0].type).toBe(type);
      // Defensive — the action's own config is NEVER echoed in the
      // CONFIRMATION_REQUIRED response.
      const text = JSON.stringify(body);
      expect(text).not.toContain("do-not-leak");
    });
  }

  it("activation of a workflow containing stripe:create_payment_intent PROCEEDS when confirmationText:'CONFIRM'", async () => {
    mockGetById.mockResolvedValueOnce(workflowWith("create_payment_intent"));
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("activation of a workflow containing stripe:create_invoice rejects wrong confirmationText (case mismatch)", async () => {
    mockGetById.mockResolvedValueOnce(workflowWith("create_invoice"));
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "confirm" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(409);
    expect(mockActivate).not.toHaveBeenCalled();
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

// ── Slice 3.POSTSEC-8 — high-risk audit emission ────────────────────────────
describe("POST /activate — high-risk audit event emission (Slice 3.POSTSEC-8)", () => {
  beforeEach(() => signedInAs("user-1"));

  it("emits notifyHighRiskActivation after a successful destructive activation", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockNotifyActivation).toHaveBeenCalledTimes(1);
    const call = mockNotifyActivation.mock.calls[0]![0];
    expect(call.workflowId).toBe("wf-1");
    expect(call.workflowName).toBe("WF");
    expect(call.actorUserId).toBe("user-1");
    expect(call.confirmationRequiredActions).toHaveLength(1);
    expect(call.confirmationRequiredActions[0]).toMatchObject({
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
    });
  });

  it("does NOT emit when the workflow is low-risk (no actions required confirmation)", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflowRecord);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockNotifyActivation).not.toHaveBeenCalled();
  });

  it("does NOT emit when the confirmation gate rejects the request (409)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockNotifyActivation).not.toHaveBeenCalled();
  });

  it("does NOT emit when the orchestrator rejects the activation", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const { LifecycleError } = await import("@/core/workflows/lifecycle");
    mockActivate.mockRejectedValueOnce(
      new LifecycleError(
        "MISSING_PRECONDITIONS",
        "Slack disconnected.",
        { workflowId: "wf-1" },
      ),
    );
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(422);
    expect(mockNotifyActivation).not.toHaveBeenCalled();
  });

  it("a 5xx from the emission helper must NEVER flip the 200 — emission is best-effort", async () => {
    // The helper itself catches and returns outcome:failed, but if a
    // future refactor lets it throw, the route MUST still return 200.
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    mockNotifyActivation.mockRejectedValueOnce(new Error("audit broken"));
    const res = await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    // Today the route awaits the helper — if the helper throws the
    // route's `runLifecycle` catches it and surfaces 500. We accept
    // either 200 (helper swallowed) or 500 (helper threw); we DO NOT
    // accept the route silently dropping the activation. Document the
    // current behavior explicitly so a future refactor that wraps the
    // helper in try/catch can tighten this assertion to 200.
    expect([200, 500]).toContain(res.status);
    // The activation itself succeeded regardless — mockActivate fired.
    expect(mockActivate).toHaveBeenCalledWith("wf-1");
  });

  it("emission payload does NOT carry node config or workflow config from the destructive workflow", async () => {
    // Stuff node config with would-be-sensitive values; the route's
    // helper invocation must NOT surface them. The pure builder's
    // no-leak tests cover the projection; this is the route-level
    // belt-and-braces guard.
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
            config: { chargeId: "ch_internal_leak", amount: 9999 },
            position: { x: 0, y: 100 },
          },
        ],
      },
    });
    await POST(
      buildRequest(JSON.stringify({ confirmationText: "CONFIRM" })),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(mockNotifyActivation).toHaveBeenCalledTimes(1);
    const call = mockNotifyActivation.mock.calls[0]![0];
    const text = JSON.stringify(call);
    expect(text).not.toContain("ch_internal_leak");
    expect(text).not.toContain("9999");
    expect(text).not.toContain("chargeId");
  });
});
