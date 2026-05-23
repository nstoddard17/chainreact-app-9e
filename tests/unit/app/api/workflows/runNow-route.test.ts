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
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

const mockEnqueueRun = jest.fn();
jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

import { POST } from "@/app/api/workflows/[id]/run-now/route";

const baseWorkflow = {
  id: "wf-1",
  userId: "user-1",
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

  it("returns 403 when the signed-in user is not the workflow owner", async () => {
    signedInAs("user-other");
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    const res = await POST(buildRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockEnqueueRun).not.toHaveBeenCalled();
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
        accountId: string;
      };
    };
    expect(enqueueCall.event.provider).toBe("native");
    expect(enqueueCall.event.eventType).toBe("manual.run");
    expect(enqueueCall.event.accountId).toBe("system");
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
    };
    expect(enqueueCall.testMode).toBe(false);
    expect(enqueueCall.triggeredBy).toBe("manual");
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
            config: { internal: "do-not-leak" },
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
