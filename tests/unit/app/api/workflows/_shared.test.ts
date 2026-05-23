/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/_shared.ts. The shared route helpers translate
 * orchestrator outcomes into HTTP responses; the typed client at
 * lib/api/workflows.ts and the routes both depend on this contract.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { LifecycleError } from "@/core/workflows/lifecycle";

// Mock supabase BEFORE importing _shared so requireUser sees the mock.
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import {
  lifecycleErrorResponse,
  parseJsonBody,
  requireUser,
  runLifecycle,
  toWorkflowDetail,
  toWorkflowRunDetail,
  toWorkflowRunSummary,
  toWorkflowSummary,
} from "@/app/api/workflows/_shared";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import { REDACTED_SENTINEL } from "@/core/security/redactOutput";

beforeEach(() => {
  mockGetUser.mockReset();
});

describe("requireUser", () => {
  it("returns ok with the user id when supabase has a session", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const result = await requireUser();
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });

  it("returns a 401 response when supabase has no user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const result = await requireUser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body).toEqual({ error: "unauthenticated" });
    }
  });

  it("returns a 401 response when supabase reports an auth error", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("token expired"),
    });
    const result = await requireUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

describe("lifecycleErrorResponse", () => {
  const cases: ReadonlyArray<[LifecycleError["code"], number]> = [
    ["WORKFLOW_NOT_FOUND", 404],
    ["INVALID_TRANSITION", 409],
    ["LIFECYCLE_CONFLICT", 409],
    ["MISSING_PRECONDITIONS", 422],
    ["TRIGGER_REGISTRATION_FAILED", 502],
  ];
  it.each(cases)("%s -> HTTP %i", async (code, expectedStatus) => {
    const err = new LifecycleError(code, "msg", { hint: "x" });
    const res = lifecycleErrorResponse(err);
    expect(res.status).toBe(expectedStatus);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "msg",
      code,
      details: { hint: "x" },
    });
  });
});

describe("runLifecycle", () => {
  it("calls toResponse on success", async () => {
    const res = await runLifecycle(
      async () => "result",
      (val) => NextResponse.json({ val }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ val: "result" });
  });

  it("converts LifecycleError to its HTTP shape", async () => {
    const res = await runLifecycle(
      async () => {
        throw new LifecycleError("INVALID_TRANSITION", "no", { from: "draft" });
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("falls back to 500 for unexpected errors", async () => {
    const res = await runLifecycle(
      async () => {
        throw new Error("boom");
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "boom" });
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns parsed data when body matches the schema", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "ok" }),
    });
    const result = await parseJsonBody(req, schema);
    expect(result).toEqual({ ok: true, data: { name: "ok" } });
  });

  it("returns 400 with the first issue message on schema failure", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const result = await parseJsonBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toMatch(/at least|String must|too_small/i);
    }
  });

  it("returns 400 when the body is not JSON", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "not-json",
    });
    const result = await parseJsonBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toMatch(/JSON/);
    }
  });
});

describe("toWorkflowSummary", () => {
  it("strips userId / activeRevisionId / draftDefinition from the wire shape", () => {
    const record: WorkflowRecord = {
      id: "wf-1",
      userId: "user-1",
      name: "Test",
      state: "active",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: "rev-1",
      draftDefinition: {
        nodes: [
          {
            id: "n1",
            kind: "trigger" as const,
            provider: "slack",
            type: "message_received",
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T01:00:00Z",
    };
    const summary = toWorkflowSummary(record);
    expect(summary).toEqual({
      id: "wf-1",
      name: "Test",
      state: "active",
      disabledReason: null,
      disabledContext: null,
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T01:00:00Z",
    });
    expect(summary).not.toHaveProperty("userId");
    expect(summary).not.toHaveProperty("activeRevisionId");
    expect(summary).not.toHaveProperty("draftDefinition");
  });
});

describe("toWorkflowDetail", () => {
  it("includes activeRevisionId + draftDefinition; still strips userId", () => {
    const record: WorkflowRecord = {
      id: "wf-1",
      userId: "user-1",
      name: "Test",
      state: "active",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: "rev-1",
      draftDefinition: {
        nodes: [
          {
            id: "n1",
            kind: "trigger" as const,
            provider: "slack",
            type: "message_received",
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T01:00:00Z",
    };
    const detail = toWorkflowDetail(record);
    expect(detail.activeRevisionId).toBe("rev-1");
    expect(detail.draftDefinition.nodes[0]?.id).toBe("n1");
    expect(detail.draftDefinition.edges).toEqual([]);
    expect(detail).not.toHaveProperty("userId");
  });
});

describe("toWorkflowRunSummary", () => {
  const triggerEvent: TriggerEvent = {
    provider: "slack",
    eventType: "message",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    accountId: "T0001",
    payload: { text: "secret" },
  };

  const baseRecord: WorkflowRunRecord = {
    id: "11111111-1111-1111-1111-111111111111",
    workflowId: "22222222-2222-2222-2222-222222222222",
    userId: "user-1",
    status: "succeeded",
    triggerNodeId: "t1",
    triggerEvent,
    steps: [
      { nodeId: "t1", status: "succeeded", output: { event: triggerEvent } },
    ],
    fatalError: null,
    errorClassification: null,
    startedAt: "2026-05-07T00:00:00Z",
    finishedAt: "2026-05-07T00:00:01Z",
    createdAt: "2026-05-07T00:00:00Z",
    isTest: false,
    triggeredBy: "unknown",
  };

  it("strips userId / steps / triggerEvent / fatalError from the wire shape", () => {
    const summary = toWorkflowRunSummary(baseRecord);
    expect(summary).not.toHaveProperty("userId");
    expect(summary).not.toHaveProperty("steps");
    expect(summary).not.toHaveProperty("triggerEvent");
    expect(summary).not.toHaveProperty("fatalError");
  });

  it("forwards the humanized errorClassification verbatim", () => {
    const summary = toWorkflowRunSummary({
      ...baseRecord,
      status: "failed",
      errorClassification: {
        title: "Slack channel not found",
        description: "...",
        action: "open_node",
        severity: "error",
      },
    });
    expect(summary.errorClassification).toMatchObject({
      title: "Slack channel not found",
      action: "open_node",
      severity: "error",
    });
  });
});

// ── Slice 3.SEC-7 — toWorkflowRunDetail redaction ───────────────────────────
describe("toWorkflowRunDetail — Slice 3.SEC-7 sensitive-output redaction", () => {
  const triggerEvent: TriggerEvent = {
    provider: "native",
    eventType: "manual.run",
    eventId: "ev-1",
    occurredAt: "2026-05-22T00:00:00Z",
    accountId: "system",
    payload: { inputs: {} },
  };

  function makeRecord(
    steps: WorkflowRunRecord["steps"],
  ): WorkflowRunRecord {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      workflowId: "22222222-2222-2222-2222-222222222222",
      userId: "user-1",
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps,
      fatalError: null,
      errorClassification: null,
      startedAt: "2026-05-22T00:00:00Z",
      finishedAt: "2026-05-22T00:00:01Z",
      createdAt: "2026-05-22T00:00:00Z",
      isTest: false,
      triggeredBy: "unknown",
    };
  }

  function makeNode(id: string, provider: string, type: string): WorkflowNode {
    return {
      id,
      kind: "action",
      provider,
      type,
      config: {},
      position: { x: 0, y: 0 },
    };
  }

  // Slice 3.SEC-8 — the original SEC-7 demos used Stripe `clientSecret`
  // as the canonical "sensitive Stripe output." SEC-8 removed
  // clientSecret from the handler projection entirely, so these tests
  // now exercise redaction against `stripe:create_customer.email` (a
  // sensitive output that still exists).
  it("redacts a sensitive Stripe output (email) when nodes are supplied", () => {
    const record = makeRecord([
      {
        nodeId: "cust-node",
        status: "succeeded",
        output: {
          customerId: "cus_1",
          email: "alice@example.com",
          name: "Alice",
        },
      },
    ]);
    const nodes = [makeNode("cust-node", "stripe", "create_customer")];
    const detail = toWorkflowRunDetail(record, nodes);
    expect(detail.steps[0]!.output).toEqual({
      customerId: "cus_1",
      email: REDACTED_SENTINEL,
      name: "Alice",
    });
  });

  it("preserves non-sensitive Stripe outputs (customerId stays visible)", () => {
    const record = makeRecord([
      {
        nodeId: "cust-node",
        status: "succeeded",
        output: { customerId: "cus_1", email: "alice@example.com" },
      },
    ]);
    const nodes = [makeNode("cust-node", "stripe", "create_customer")];
    const detail = toWorkflowRunDetail(record, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.customerId).toBe("cus_1");
    expect(out.email).toBe(REDACTED_SENTINEL);
  });

  it("redacts http_request body + bodyJson when meta is wired", () => {
    const record = makeRecord([
      {
        nodeId: "http-node",
        status: "succeeded",
        output: {
          status: 200,
          ok: true,
          body: "secret-leaked-response",
          bodyJson: { token: "leaked-token" },
        },
      },
    ]);
    const nodes = [makeNode("http-node", "native", "http_request")];
    const detail = toWorkflowRunDetail(record, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.body).toBe(REDACTED_SENTINEL);
    expect(out.bodyJson).toBe(REDACTED_SENTINEL);
    // Non-sensitive fields stay.
    expect(out.status).toBe(200);
    expect(out.ok).toBe(true);
  });

  it("redacts a sensitive object output as a whole (Stripe findCustomer.customer)", () => {
    const record = makeRecord([
      {
        nodeId: "find-node",
        status: "succeeded",
        output: {
          found: true,
          customer: { customerId: "cus_1", email: "x@y.z", name: "Alice" },
        },
      },
    ]);
    const nodes = [makeNode("find-node", "stripe", "find_customer")];
    const detail = toWorkflowRunDetail(record, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.found).toBe(true);
    expect(out.customer).toBe(REDACTED_SENTINEL);
  });

  it("does NOT redact when workflowNodes is omitted (legacy behavior preserved)", () => {
    const record = makeRecord([
      {
        nodeId: "cust-node",
        status: "succeeded",
        output: { customerId: "cus_1", email: "alice@example.com" },
      },
    ]);
    const detail = toWorkflowRunDetail(record);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.email).toBe("alice@example.com");
  });

  it("passes through steps whose nodeId is missing from workflowNodes (workflow edited post-run)", () => {
    const record = makeRecord([
      {
        nodeId: "deleted-node",
        status: "succeeded",
        output: { secret: "abc" },
      },
    ]);
    // Workflow no longer has that node — fail-open: output unchanged.
    const nodes: WorkflowNode[] = [];
    const detail = toWorkflowRunDetail(record, nodes);
    expect(detail.steps[0]!.output).toEqual({ secret: "abc" });
  });

  it("does NOT mutate the persisted record's output (immutability)", () => {
    const originalOutput = {
      customerId: "cus_1",
      email: "alice@example.com",
    };
    const record = makeRecord([
      { nodeId: "cust-node", status: "succeeded", output: originalOutput },
    ]);
    const nodes = [makeNode("cust-node", "stripe", "create_customer")];
    toWorkflowRunDetail(record, nodes);
    // Persisted record is unchanged.
    expect(originalOutput.email).toBe("alice@example.com");
    expect(record.steps[0]!.output).toBe(originalOutput);
  });

  it("redacts only the matching step when multiple steps with different actions are present", () => {
    const record = makeRecord([
      {
        nodeId: "cust-node",
        status: "succeeded",
        output: { customerId: "cus_1", email: "alice@example.com" },
      },
      {
        nodeId: "fmt-node",
        status: "succeeded",
        output: { formatted: "ok" },
      },
    ]);
    const nodes = [
      makeNode("cust-node", "stripe", "create_customer"),
      makeNode("fmt-node", "native", "format_transformer"),
    ];
    const detail = toWorkflowRunDetail(record, nodes);
    const custOut = detail.steps[0]!.output as Record<string, unknown>;
    const fmtOut = detail.steps[1]!.output as Record<string, unknown>;
    expect(custOut.email).toBe(REDACTED_SENTINEL);
    expect(fmtOut.formatted).toBe("ok");
  });
});
