/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/run-now/route.ts — Native-nodes Slice 2
 * Commit 1 (docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §10.2).
 *
 * Mocks supabase auth + workflows repo + enqueueRun so the route is
 * tested in isolation. Verifies auth, ownership, state gate, body
 * parsing + cap, trigger-node lookup, and the 202 happy path shape.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
// V2-READY-41E — the route resolves the executed definition via the REAL
// getDefinitionForExecution. With the flag OFF (default) it returns the draft
// without a revision read; the flag-ON tests below mock the revision read.
const mockGetRevisionByIdServiceRole = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
  getRevisionByIdServiceRole: (...args: unknown[]) =>
    mockGetRevisionByIdServiceRole(...args),
}));

// 4.TEAM-WORKFLOWS-2B: run-now now authorizes by account MEMBERSHIP of
// `workflow.accountId` (no active-account equality). Default: caller is a
// member; the non-member test overrides to false.
const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

const mockEnqueueRun = jest.fn();
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

// Slice 6 durable queue — the route best-effort drains its own queued run via
// after(processQueuedRun(runId)). Mocked so the route's drain wiring is asserted
// without the real processor touching the DB.
const mockProcessQueuedRun = jest.fn();
jest.mock("@/services/execution/runQueueProcessor", () => ({
  processQueuedRun: (...args: unknown[]) => mockProcessQueuedRun(...args),
}));

// V2-READY-35 — up-front account-freeze gate. Default non-frozen so existing
// tests are unaffected; the frozen test overrides to true.
const mockIsAccountFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

// Slice 3.POSTSEC-8 — high-risk run-now audit emission. Mocked so
// route tests can assert "audit event was emitted with the right
// payload" without hitting the notifications repo.
const mockNotifyRun = jest.fn();
jest.mock("@/services/notifications/notifyHighRiskWorkflowEvent", () => ({
  notifyHighRiskRun: (...args: unknown[]) => mockNotifyRun(...args),
  // Unused in this test file but exported by the module under mock.
  notifyHighRiskActivation: jest.fn(),
}));

// Stub Next's `after` (the serverless lifecycle extender) while keeping the
// real NextResponse the route relies on for status/json. Lets us assert the
// route's keepAlive wiring without a live request lifecycle.
const mockAfter = jest.fn();
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (cb: unknown) => mockAfter(cb),
}));

import { POST } from "@/app/api/workflows/[id]/run-now/route";

const baseWorkflow = {
  id: "wf-1",
  userId: "user-1",
  accountId: "acct-user-1",
  name: "WF",
  state: "active" as const,
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
      {
        id: "action-node",
        kind: "action" as const,
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C1", text: "hi" },
        position: { x: 0, y: 100 },
      },
    ],
    edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
  },
  deletedAt: null,
  createdAt: "2026-05-16T00:00:00Z",
  updatedAt: "2026-05-16T00:00:00Z",
};

function signedInAs(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function unsignedIn(): void {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function buildRequest(opts: {
  body?: string;
  contentLength?: number | null;
  contentType?: string;
} = {}): Request {
  const headers = new Headers();
  headers.set("content-type", opts.contentType ?? "application/json");
  if (opts.contentLength !== undefined) {
    if (opts.contentLength !== null) {
      headers.set("content-length", String(opts.contentLength));
    }
  } else if (opts.body !== undefined) {
    headers.set("content-length", String(Buffer.byteLength(opts.body, "utf8")));
  }
  return new Request("http://localhost/api/workflows/wf-1/run-now", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  mockEnqueueRun.mockReset();
  mockEnqueueRun.mockResolvedValue({
    runId: "run-mock",
    enqueuedAt: "2026-05-16T00:00:01Z",
  });
  mockNotifyRun.mockReset();
  mockNotifyRun.mockResolvedValue({ outcome: "emitted" });
  // Default: caller is a member of the workflow's account.
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  // Default: account is operational (not frozen).
  mockIsAccountFrozen.mockReset();
  mockIsAccountFrozen.mockResolvedValue(false);
  mockGetRevisionByIdServiceRole.mockReset();
});

// ── auth + ownership ────────────────────────────────────────────────────────

describe("POST /run-now — auth + ownership", () => {
  it("returns 401 when no user is signed in", async () => {
    unsignedIn();
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("returns 404 when workflow is missing", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(null);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-missing" }),
    });
    expect(res.status).toBe(404);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("returns 404 when workflow state === 'deleted' (soft-delete hidden)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, state: "deleted" });
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("V2-READY-35 — returns 403 account_frozen for a frozen account and never enqueues", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    mockIsAccountFrozen.mockResolvedValueOnce(true);

    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("account_frozen");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    // No-leak: the safe message never exposes the account id.
    expect(JSON.stringify(body)).not.toContain("acct-user-1");
  });

  it("still enqueues for an active, non-frozen account (regression)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    mockIsAccountFrozen.mockResolvedValueOnce(false);

    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  // 4.TEAM-WORKFLOWS-2B — membership authorization (replaces active-account equality).
  it("returns 404 (no existence leak) when the caller is NOT a member of the workflow's account", async () => {
    signedInAs("user-other");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, accountId: "acct-team-B" });
    mockIsMember.mockResolvedValueOnce(false);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockIsMember).toHaveBeenCalledWith("user-other", "acct-team-B");
  });

  it("a Team member can run the workflow while a DIFFERENT account is active (membership, not active-account)", async () => {
    // No active-account resolution happens at all — only isMember of the
    // workflow's own account is consulted. member-2 belongs to acct-team-A.
    signedInAs("member-2");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, accountId: "acct-team-A" });
    mockIsMember.mockResolvedValueOnce(true);
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    expect(mockIsMember).toHaveBeenCalledWith("member-2", "acct-team-A");
    // The actor recorded on the run is the caller.
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      triggeredByUserId: string | null;
    };
    expect(enqueueCall.triggeredByUserId).toBe("member-2");
  });

  it("a plain member (no owner/admin role) can run — roles do NOT gate run-now", async () => {
    signedInAs("plain-member");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, accountId: "acct-team-A" });
    mockIsMember.mockResolvedValueOnce(true); // membership is the only gate
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
  });

  it("personal-account workflow owner still works (owner is a member of their personal account)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow); // accountId acct-user-1
    mockIsMember.mockResolvedValueOnce(true);
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    expect(mockIsMember).toHaveBeenCalledWith("user-1", "acct-user-1");
  });
});

// ── state gate ──────────────────────────────────────────────────────────────

describe("POST /run-now — workflow state gate", () => {
  it.each(["active", "paused", "draft"] as const)(
    "accepts state '%s'",
    async (state) => {
      signedInAs("user-1");
      mockGetById.mockResolvedValueOnce({ ...baseWorkflow, state });
      const res = await POST(buildRequest({ body: "{}" }), {
        params: Promise.resolve({ id: "wf-1" }),
      });
      expect(res.status).toBe(202);
    },
  );

  it.each(["disabled", "eligible_to_resume"] as const)(
    "rejects state '%s' with 409",
    async (state) => {
      signedInAs("user-1");
      mockGetById.mockResolvedValueOnce({ ...baseWorkflow, state });
      const res = await POST(buildRequest({ body: "{}" }), {
        params: Promise.resolve({ id: "wf-1" }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.state).toBe(state);
      expect(mockEnqueueRun).not.toHaveBeenCalled();
    },
  );
});

// ── A: Run-Manually readiness preflight ──────────────────────────────────────

/** A workflow whose action node is a native HTTP Request with the given config. */
function workflowWithHttpAction(config: Record<string, unknown>) {
  return {
    ...baseWorkflow,
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
        {
          id: "http-node",
          kind: "action" as const,
          provider: "native",
          type: "http_request",
          config,
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "http-node" }],
    },
  };
}

describe("POST /run-now — A: readiness preflight (missing required fields)", () => {
  it("blocks a real run with 422 + friendly message when HTTP Request has no Method/URL — no enqueue, no raw Zod dump", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(workflowWithHttpAction({}));
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.message).toBe(
      "HTTP Request is missing required fields: Method, URL.",
    );
    expect(body.nodes[0].nodeId).toBe("http-node");
    expect(body.nodes[0].missingFields).toEqual(["Method", "URL"]);
    // The user must NEVER see a raw handler Zod dump for obvious missing config.
    expect(JSON.stringify(body)).not.toContain("invalid_type");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("blocks when only Method is missing", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowWithHttpAction({ url: "https://example.com" }),
    );
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("Method");
    expect(body.message).not.toContain("URL");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("blocks when only URL is missing", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(workflowWithHttpAction({ method: "GET" }));
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toContain("URL");
    expect(body.message).not.toContain("Method");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("runs (202) when Method + URL are both present", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowWithHttpAction({ method: "GET", url: "https://example.com" }),
    );
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalled();
  });

  it("does NOT block a TEST-mode run of an unconfigured node (test mode skips external handlers)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(workflowWithHttpAction({}));
    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: true }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalled();
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
    };
    expect(enqueueCall.testMode).toBe(true);
  });
});

// ── B: graph-integrity preflight ─────────────────────────────────────────────

describe("POST /run-now — B: graph-integrity preflight", () => {
  const manualTrigger = {
    id: "trigger-node",
    kind: "trigger" as const,
    provider: "native",
    type: "manual.run",
    config: {},
    position: { x: 0, y: 0 },
  };
  const configuredHttp = (id: string) => ({
    id,
    kind: "action" as const,
    provider: "native",
    type: "http_request",
    config: { method: "GET", url: "https://example.com" },
    position: { x: 0, y: 100 },
  });
  function workflowGraph(
    nodes: unknown[],
    edges: unknown[],
  ): typeof baseWorkflow {
    return { ...baseWorkflow, draftDefinition: { nodes, edges } } as typeof baseWorkflow;
  }

  it("blocks an orphan/unreachable action with INVALID_WORKFLOW_GRAPH — no enqueue", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowGraph([manualTrigger, configuredHttp("http-node")], []), // no edge
    );
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_WORKFLOW_GRAPH");
    expect(body.graph.some((g: { code: string }) => g.code === "unreachable_node")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("invalid_type");
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("blocks a stale edge referencing a missing node", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowGraph(
        [manualTrigger, configuredHttp("http-node")],
        [
          { id: "e1", from: "trigger-node", to: "http-node" },
          { id: "e-stale", from: "http-node", to: "ghost" },
        ],
      ),
    );
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_WORKFLOW_GRAPH");
    expect(body.graph.some((g: { code: string }) => g.code === "stale_edge")).toBe(true);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("a connected, configured workflow runs (202) — rewired Trigger → Action shape", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowGraph(
        [manualTrigger, configuredHttp("http-node")],
        [{ id: "e1", from: "trigger-node", to: "http-node" }],
      ),
    );
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalled();
  });

  it("does NOT block an invalid graph in TEST mode (test mode tolerates orphans)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(
      workflowGraph([manualTrigger, configuredHttp("http-node")], []),
    );
    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: true }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalled();
  });
});

// ── body parsing + cap ──────────────────────────────────────────────────────

describe("POST /run-now — body parsing", () => {
  it("returns 413 when content-length > 256 KiB", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(
      buildRequest({ contentLength: 256 * 1024 + 1, body: "{}" }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(413);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON body", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(buildRequest({ body: "{not json" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("returns 400 on .strict() Zod violation (extension field at top level)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(
      buildRequest({ body: JSON.stringify({ inputs: {}, extra: 1 }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("treats an empty body as { inputs: {} } via the schema default", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(
      buildRequest({ body: "", contentLength: 0 }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { payload: { inputs: Record<string, unknown> } };
    };
    expect(enqueueCall.event.payload).toEqual({ inputs: {} });
  });

  it("forwards the inputs object verbatim to the TriggerEvent payload", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const inputs = {
      target: "abc",
      message: "hi",
      nested: { deep: true, list: [1, 2] },
    };
    const res = await POST(
      buildRequest({ body: JSON.stringify({ inputs }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { payload: { inputs: Record<string, unknown> } };
    };
    expect(enqueueCall.event.payload.inputs).toEqual(inputs);
  });

  // V2-READY-16: meta/payload output contract. The manual.run meta payloadShape
  // advertises the references downstream nodes may use ({{trigger.inputs.*}});
  // pin its top-level names to the keys the route actually puts on the emitted
  // TriggerEvent payload so a future change can't drift them apart.
  it("meta payloadShape names match the emitted manual TriggerEvent payload keys (output contract)", async () => {
    const { manualTriggerMeta } = await import(
      "@/integrations/native/triggers/manualTrigger.meta"
    );
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(
      buildRequest({ body: JSON.stringify({ inputs: { a: 1 } }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { payload: Record<string, unknown> };
    };
    const payloadKeys = Object.keys(enqueueCall.event.payload).sort();
    const metaKeys = manualTriggerMeta.payloadShape.map((p) => p.name).sort();
    expect(metaKeys).toEqual(payloadKeys);
  });
});

// ── trigger node lookup ────────────────────────────────────────────────────

describe("POST /run-now — trigger node lookup", () => {
  it("returns 422 when the workflow has no manual_trigger node", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          {
            id: "slack-trigger",
            kind: "trigger" as const,
            provider: "slack",
            type: "slack.message.channel",
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ignores action nodes with provider==='native' AND type==='manual.run' (wrong kind)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          // No trigger; an action node pretending to be one shouldn't match.
          {
            id: "fake",
            kind: "action" as const,
            provider: "native",
            type: "manual.run",
            config: {},
            position: { x: 0, y: 100 },
          },
        ],
        edges: [],
      },
    });
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
  });
});

// ── happy path event shape ─────────────────────────────────────────────────

describe("POST /run-now — happy path", () => {
  beforeEach(() => {
    signedInAs("user-1");
    mockGetById.mockResolvedValue(baseWorkflow);
  });

  it("returns 202 with { runId, enqueuedAt, isTest, triggeredBy } shape", async () => {
    const res = await POST(
      buildRequest({ body: JSON.stringify({ inputs: { x: 1 } }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({
      runId: "run-mock",
      enqueuedAt: "2026-05-16T00:00:01Z",
      isTest: false,
      triggeredBy: "manual",
    });
  });

  it("enqueues with the manual_trigger's nodeId from the workflow", async () => {
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      workflowId: string;
      triggerNodeId: string;
    };
    expect(enqueueCall.workflowId).toBe("wf-1");
    expect(enqueueCall.triggerNodeId).toBe("trigger-node");
  });

  it("event has provider='native', eventType='manual.run', accountId='system'", async () => {
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: {
        provider: string;
        eventType: string;
        providerAccountId: string;
      };
    };
    expect(enqueueCall.event.provider).toBe("native");
    expect(enqueueCall.event.eventType).toBe("manual.run");
    expect(enqueueCall.event.providerAccountId).toBe("system");
  });

  it("event.eventId is a UUID v4 string", async () => {
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { eventId: string };
    };
    expect(enqueueCall.event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("event.occurredAt is an ISO timestamp", async () => {
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { occurredAt: string };
    };
    expect(enqueueCall.event.occurredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    // Sanity: parseable as a Date.
    expect(Number.isNaN(Date.parse(enqueueCall.event.occurredAt))).toBe(false);
  });

  it("does NOT call dispatchTriggerEvent (route bypasses dispatcher)", async () => {
    // We don't import the dispatcher module here; if the route accidentally
    // started using it, the test suite would fail at import time. Asserting
    // a contract: enqueueRun was called.
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });
});

// ── Slice 3.SEC-2 — testMode flag ───────────────────────────────────────────
describe("POST /run-now — testMode flag (Slice 3.SEC-2)", () => {
  beforeEach(() => {
    signedInAs("user-1");
    mockGetById.mockResolvedValue(baseWorkflow);
  });

  it("defaults to real execution: testMode false + triggeredBy 'manual' when body omits testMode", async () => {
    await POST(buildRequest({ body: JSON.stringify({ inputs: {} }) }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
      triggeredByApiKeyId?: string | null;
      triggeredByApiKeyPrefix?: string | null;
    };
    expect(enqueueCall.testMode).toBe(false);
    expect(enqueueCall.triggeredBy).toBe("manual");
    // RH-2 — manual run-now carries NO API-key provenance.
    expect(enqueueCall.triggeredByApiKeyId ?? null).toBeNull();
    expect(enqueueCall.triggeredByApiKeyPrefix ?? null).toBeNull();
  });

  it("4.ACCOUNT-MODEL-8: records the caller as the actor (triggeredByUserId) for a manual run", async () => {
    signedInAs("user-1");
    await POST(buildRequest({ body: JSON.stringify({ inputs: {} }) }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      triggeredByUserId: string | null;
    };
    expect(enqueueCall.triggeredByUserId).toBe("user-1");
  });

  it("explicit testMode: true forwards to enqueueRun with triggeredBy='test'", async () => {
    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: true, inputs: {} }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(enqueueCall.testMode).toBe(true);
    expect(enqueueCall.triggeredBy).toBe("test");
    const body = await res.json();
    expect(body.isTest).toBe(true);
    expect(body.triggeredBy).toBe("test");
  });

  it("explicit testMode: false does NOT silently promote (mirrors omission)", async () => {
    await POST(
      buildRequest({ body: JSON.stringify({ testMode: false, inputs: {} }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(enqueueCall.testMode).toBe(false);
    expect(enqueueCall.triggeredBy).toBe("manual");
  });

  it("rejects non-boolean testMode at the envelope layer with 400", async () => {
    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: "yes", inputs: {} }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("testMode does NOT pollute the trigger event payload (kept at envelope layer)", async () => {
    await POST(
      buildRequest({
        body: JSON.stringify({ testMode: true, inputs: { x: 1 } }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      event: { payload: Record<string, unknown> };
    };
    expect(enqueueCall.event.payload).toEqual({ inputs: { x: 1 } });
    expect(enqueueCall.event.payload).not.toHaveProperty("testMode");
  });
});

// ── Slice 3.SEC-4B — destructive-action confirmation gate ──────────────────

const destructiveWorkflow = {
  ...baseWorkflow,
  draftDefinition: {
    nodes: [
      baseWorkflow.draftDefinition.nodes[0]!, // trigger
      {
        id: "refund-node",
        kind: "action" as const,
        provider: "stripe",
        type: "create_refund",
        config: { chargeId: "ch_secret_1", metadata: { internal: "do-not-leak" } },
        position: { x: 0, y: 100 },
      },
    ],
    edges: [
      { id: "e1", from: baseWorkflow.draftDefinition.nodes[0]!.id, to: "refund-node" },
    ],
  },
};

describe("POST /run-now — destructive-action confirmation (Slice 3.SEC-4B)", () => {
  beforeEach(() => {
    signedInAs("user-1");
  });

  it("returns 409 CONFIRMATION_REQUIRED when testMode=false + destructive action + no confirmationText", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    expect(mockEnqueueRun).not.toHaveBeenCalled();

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
      buildRequest({
        body: JSON.stringify({ confirmationText: "confirm" }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(409);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("enqueues a real run when correct confirmationText is supplied", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ confirmationText: "CONFIRM", inputs: {} }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(enqueueCall.testMode).toBe(false);
    expect(enqueueCall.triggeredBy).toBe("manual");
  });

  it("testMode=true bypasses the confirmation gate even for destructive workflows (SEC-2 blocks externally)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ testMode: true, inputs: {} }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(enqueueCall.testMode).toBe(true);
    expect(enqueueCall.triggeredBy).toBe("test");
  });

  it("low-risk workflow does NOT require confirmation when testMode=false", async () => {
    // baseWorkflow has a slack:send_channel_message action which is
    // medium-risk, not destructive, not requiresConfirmation.
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
  });

  it("response does NOT include node config when CONFIRMATION_REQUIRED fires", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(text).not.toContain("ch_secret_1");
    expect(text).not.toContain("do-not-leak");
    expect(text).not.toContain("draftDefinition");
  });

  it("rejects non-string confirmationText at envelope (400 not 409)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow);
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ confirmationText: 123 }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("Slack delete_message in workflow also requires confirmation", async () => {
    mockGetById.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          baseWorkflow.draftDefinition.nodes[0]!,
          {
            id: "slack-delete-node",
            kind: "action" as const,
            provider: "slack",
            type: "delete_message",
            config: {},
            position: { x: 0, y: 100 },
          },
        ],
        edges: [],
      },
    });
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("CONFIRMATION_REQUIRED");
    expect(body.actions[0].provider).toBe("slack");
    expect(body.actions[0].type).toBe("delete_message");
  });
});

// ── Slice 3.POSTSEC-3 — newly-confirmed Stripe money-moving actions ────────
//
// The 5 Stripe high-risk-but-reversible actions now require typed
// confirmation per the POSTSEC-3 product call. Each action's workflow,
// when run in real mode without `confirmationText`, returns 409
// CONFIRMATION_REQUIRED. testMode=true continues to bypass (SEC-2 blocks
// before handler invocation).
describe("POST /run-now — POSTSEC-3 newly-confirmed Stripe money-moving actions", () => {
  beforeEach(() => {
    signedInAs("user-1");
  });

  function workflowWith(action: { provider: string; type: string }) {
    return {
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          baseWorkflow.draftDefinition.nodes[0]!,
          {
            id: "stripe-node",
            kind: "action" as const,
            provider: action.provider,
            type: action.type,
            // amount/currency satisfy create_payment_intent's required-field
            // preflight (A) on the enqueue path; the no-confirmation cases never
            // reach the preflight (the 409 gate fires first). `internal` proves
            // raw config is never echoed in the CONFIRMATION_REQUIRED response.
            config: { amount: 10, currency: "usd", internal: "do-not-leak" },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [
          {
            id: "e1",
            from: baseWorkflow.draftDefinition.nodes[0]!.id,
            to: "stripe-node",
          },
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
    it(`stripe:${type} in workflow returns 409 CONFIRMATION_REQUIRED when testMode=false + no confirmationText`, async () => {
      mockGetById.mockResolvedValueOnce(workflowWith({ provider: "stripe", type }));
      const res = await POST(buildRequest({ body: "{}" }), {
        params: Promise.resolve({ id: "wf-1" }),
      });
      expect(res.status).toBe(409);
      expect(mockEnqueueRun).not.toHaveBeenCalled();
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

  it("stripe:create_payment_intent — correct confirmationText enqueues real run", async () => {
    mockGetById.mockResolvedValueOnce(
      workflowWith({ provider: "stripe", type: "create_payment_intent" }),
    );
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ confirmationText: "CONFIRM", inputs: {} }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(call.testMode).toBe(false);
    expect(call.triggeredBy).toBe("manual");
  });

  it("stripe:create_invoice — testMode=true bypasses confirmation gate (SEC-2 blocks before handler)", async () => {
    mockGetById.mockResolvedValueOnce(
      workflowWith({ provider: "stripe", type: "create_invoice" }),
    );
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ testMode: true, inputs: {} }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const call = mockEnqueueRun.mock.calls[0]![0] as {
      testMode: boolean;
      triggeredBy: string;
    };
    expect(call.testMode).toBe(true);
    expect(call.triggeredBy).toBe("test");
  });
});

// ── Slice 3.POSTSEC-8 — high-risk run-now audit emission ────────────────────
describe("POST /run-now — high-risk audit event emission (Slice 3.POSTSEC-8)", () => {
  beforeEach(() => signedInAs("user-1"));

  function destructiveWorkflow() {
    return {
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          baseWorkflow.draftDefinition.nodes[0]!,
          {
            id: "refund-node",
            kind: "action" as const,
            provider: "stripe",
            type: "create_refund",
            config: { chargeId: "ch_internal_leak" },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "refund-node" }],
      },
    };
  }

  it("emits notifyHighRiskRun after a successful real-mode run on a destructive workflow", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow());
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ inputs: {}, confirmationText: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockNotifyRun).toHaveBeenCalledTimes(1);
    const call = mockNotifyRun.mock.calls[0]![0];
    expect(call.workflowId).toBe("wf-1");
    expect(call.workflowName).toBe("WF");
    expect(call.actorUserId).toBe("user-1");
    expect(call.runId).toBe("run-mock");
    expect(call.isTest).toBe(false);
    expect(call.triggeredBy).toBe("manual");
    expect(call.confirmationRequiredActions).toHaveLength(1);
    expect(call.confirmationRequiredActions[0]).toMatchObject({
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
    });
  });

  it("does NOT emit on a testMode run, even if the workflow is destructive", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow());
    const res = await POST(
      buildRequest({
        body: JSON.stringify({ testMode: true, inputs: {} }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    // testMode skips the SEC-4B gate; risk is null at the route layer,
    // so the helper is never invoked. (The helper itself ALSO defends
    // by short-circuiting on isTest:true — covered in the unit tests.)
    expect(mockNotifyRun).not.toHaveBeenCalled();
  });

  it("does NOT emit on a low-risk real-mode run (no destructive actions in graph)", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(
      buildRequest({ body: JSON.stringify({ inputs: {} }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockNotifyRun).not.toHaveBeenCalled();
  });

  it("does NOT emit when the confirmation gate rejects the request (409)", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow());
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(409);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockNotifyRun).not.toHaveBeenCalled();
  });

  it("emission payload does NOT carry node config from the destructive workflow", async () => {
    mockGetById.mockResolvedValueOnce(destructiveWorkflow());
    await POST(
      buildRequest({
        body: JSON.stringify({ inputs: {}, confirmationText: "CONFIRM" }),
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(mockNotifyRun).toHaveBeenCalledTimes(1);
    const call = mockNotifyRun.mock.calls[0]![0];
    const text = JSON.stringify(call);
    // ch_internal_leak is in the destructive workflow's node config —
    // it MUST NOT reach the audit emission.
    expect(text).not.toContain("ch_internal_leak");
    expect(text).not.toContain("chargeId");
  });
});

// ── manual-run durability — durable enqueue + after(processQueuedRun) ─────────
//
// Slice 6 durable queue: enqueueRun persists a durable 'queued' run row and the
// route best-effort drains THAT run via after(processQueuedRun(runId)) for
// responsiveness. The run is never lost: it is a committed row, so if the
// serverless instance is reclaimed before the drain claims it, the
// /api/cron/process-run-queue tick drains it. This replaces the prior
// fire-and-forget keepAlive wiring (the engine no longer runs inside enqueueRun).
describe("POST /run-now — durable enqueue + inline drain wiring", () => {
  beforeEach(() => {
    signedInAs("user-1");
    mockGetById.mockResolvedValue(baseWorkflow);
    mockAfter.mockReset();
    mockProcessQueuedRun.mockReset();
  });

  it("does NOT pass a keepAlive extender to enqueueRun (the engine no longer runs inline)", async () => {
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as Record<string, unknown>;
    expect(enqueueCall.keepAlive).toBeUndefined();
    // The owning account is forwarded so enqueueRun skips a redundant lookup.
    expect(enqueueCall.accountId).toBe("acct-user-1");
  });

  it("drains the enqueued run via after(processQueuedRun(runId)) (durable + responsive)", async () => {
    mockEnqueueRun.mockResolvedValueOnce({
      runId: "run-xyz",
      enqueuedAt: "2026-06-26T00:00:00Z",
    });
    await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    // The route kicks the drain for THIS run and hands the promise to after().
    expect(mockProcessQueuedRun).toHaveBeenCalledTimes(1);
    expect(mockProcessQueuedRun).toHaveBeenCalledWith("run-xyz");
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("test-mode runs are also drained (test runs must finalize too)", async () => {
    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: true, inputs: {} }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(202);
    const enqueueCall = mockEnqueueRun.mock.calls[0]![0] as { testMode: boolean };
    expect(enqueueCall.testMode).toBe(true);
    expect(mockProcessQueuedRun).toHaveBeenCalledTimes(1);
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("a readiness-blocked run (422) never enqueues, so no drain path runs", async () => {
    mockGetById.mockResolvedValueOnce(workflowWithHttpAction({})); // no method/url
    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(422);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
    expect(mockProcessQueuedRun).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });
});

// ── V2-READY-41E: live-vs-draft execution definition semantics ───────────────
describe("POST /run-now — execution definition mode (V2-READY-41E)", () => {
  // A valid revision definition whose manual-trigger node id DIFFERS from the
  // draft's ("trigger-node") — proves a live run validates/enqueues against the
  // revision, not the mutable draft.
  const revisionDefinition = {
    nodes: [
      {
        id: "rev-trigger",
        kind: "trigger" as const,
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "action-node",
        kind: "action" as const,
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C1", text: "hi" },
        position: { x: 0, y: 100 },
      },
    ],
    edges: [{ id: "e1", from: "rev-trigger", to: "action-node" }],
  };

  it("real run: executes the ACTIVE REVISION (trigger from revision, mode 'live') — V2-READY-41H", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, activeRevisionId: "rev-1" });
    mockGetRevisionByIdServiceRole.mockResolvedValueOnce({
      id: "rev-1",
      workflowId: "wf-1",
      definition: revisionDefinition,
      createdAt: "2026-06-15T00:00:00Z",
    });

    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(202);
    expect(mockGetRevisionByIdServiceRole).toHaveBeenCalledWith("rev-1");
    const call = mockEnqueueRun.mock.calls[0]![0] as {
      triggerNodeId: string;
      testMode?: boolean;
    };
    // The route validated + enqueued against the ACTIVE REVISION (its trigger
    // node id, not the draft's). Slice 6: the route no longer forwards an
    // executionDefinitionMode — the engine derives "live" from testMode:false.
    expect(call.triggerNodeId).toBe("rev-trigger");
    expect(call.testMode ?? false).toBe(false);
  });

  it("test run: executes the DRAFT (mode 'draft', no revision read)", async () => {
    signedInAs("user-1");
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, activeRevisionId: "rev-1" });

    const res = await POST(
      buildRequest({ body: JSON.stringify({ testMode: true }) }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );

    expect(res.status).toBe(202);
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
    const call = mockEnqueueRun.mock.calls[0]![0] as {
      triggerNodeId: string;
      testMode: boolean;
    };
    // The route validated + enqueued against the DRAFT. Slice 6: the engine
    // derives "draft" from testMode:true (no forwarded mode).
    expect(call.triggerNodeId).toBe("trigger-node"); // the draft's node
    expect(call.testMode).toBe(true);
  });

  it("real run + legacy null active_revision_id: safe draft fallback, mode 'live' (no revision read)", async () => {
    signedInAs("user-1");
    // baseWorkflow has activeRevisionId: null — a legacy / pre-41C active workflow.
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, activeRevisionId: null });

    const res = await POST(buildRequest({ body: "{}" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(202);
    // Null pointer → getActiveDefinition returns the draft without touching a revision.
    expect(mockGetRevisionByIdServiceRole).not.toHaveBeenCalled();
    const call = mockEnqueueRun.mock.calls[0]![0] as {
      triggerNodeId: string;
      testMode?: boolean;
    };
    expect(call.triggerNodeId).toBe("trigger-node");
    expect(call.testMode ?? false).toBe(false);
  });
});
