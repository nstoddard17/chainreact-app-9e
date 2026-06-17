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
import { AccountFrozenError } from "@/services/accounts/accountFreeze";

// Mock supabase BEFORE importing _shared so requireUser sees the mock.
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

// V2-READY-41G — control the drift signal toWorkflowDetail consults. The real
// hasDraftDrift is unit-tested in activeRevision.test; here we only assert the
// flag/state gating around it. (Only called when the active-revision flag is ON.)
const mockHasDraftDrift = jest.fn();
jest.mock("@/services/workflows/activeRevision", () => ({
  hasDraftDrift: (...args: unknown[]) => mockHasDraftDrift(...args),
}));

import {
  assertWorkflowRunEditAllowed,
  lifecycleErrorResponse,
  parseJsonBody,
  requireUser,
  runLifecycle,
  toWorkflowDetail,
  toWorkflowListItem,
  toWorkflowRunDetail,
  toWorkflowRunSummary,
  toWorkflowSummary,
} from "@/app/api/workflows/_shared";
import type { WorkflowRecord } from "@/repositories/workflows";

function recordWith(over: Partial<WorkflowRecord>): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "creator-1",
    name: "WF",
    state: "draft",
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
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  } as WorkflowRecord;
}

function node(provider: string) {
  return { id: provider, kind: "action" as const, provider, type: "x", config: {}, position: { x: 0, y: 0 } };
}

describe("WF-RUNPERM — assertWorkflowRunEditAllowed", () => {
  const gmail = recordWith({ draftDefinition: { nodes: [node("gmail")], edges: [] } as never, createdByUserId: "creator-1" });
  const slack = recordWith({ draftDefinition: { nodes: [node("slack")], edges: [] } as never, createdByUserId: "creator-1" });

  // These run with ENABLE_CONNECTION_SHARING unset (OFF) → the gate takes the
  // flag-off branch, which is byte-identical WF-RUNPERM (now async).
  it("creator may run/edit a private-credential workflow → null (allowed)", async () => {
    expect(await assertWorkflowRunEditAllowed(gmail, "creator-1")).toBeNull();
  });
  it("non-creator (incl. owner/admin) blocked on private → typed 403 with SAFE copy", async () => {
    const res = await assertWorkflowRunEditAllowed(gmail, "other-member");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("WORKFLOW_USES_PRIVATE_CREDENTIAL");
    // No leak: no provider id/email/label/scope/token/createdByUserId in the body.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/gmail|creator-1|token|email|scope/i);
  });
  it("null-creator private workflow blocked for everyone", async () => {
    // createdByUserId is typed `string` (DB is ON DELETE SET NULL — a known
    // type-lie for the deleted-member edge); model the null at runtime via cast.
    const orphan = {
      ...recordWith({ draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
      createdByUserId: null,
    } as unknown as WorkflowRecord;
    expect(await assertWorkflowRunEditAllowed(orphan, "creator-1")).not.toBeNull();
  });
  it("account-only workflow allowed for any member → null", async () => {
    expect(await assertWorkflowRunEditAllowed(slack, "any-member")).toBeNull();
  });
});

describe("WF-RUNPERM — DTO booleans (no credential detail)", () => {
  const gmail = recordWith({ createdByUserId: "creator-1", draftDefinition: { nodes: [node("gmail")], edges: [] } as never });
  const slack = recordWith({ createdByUserId: "creator-1", draftDefinition: { nodes: [node("slack")], edges: [] } as never });

  // toWorkflowDetail is now async (CS-5a). Flag OFF (env unset) → exact WF-RUNPERM.
  it("detail: creator gets usesPrivateCredential+viewerCanRunEdit; no createdByUserId leak", async () => {
    const d = await toWorkflowDetail(gmail, "creator-1");
    expect(d.usesPrivateCredential).toBe(true);
    expect(d.viewerCanRunEdit).toBe(true);
    expect(d).not.toHaveProperty("createdByUserId");
  });
  it("detail: non-creator on private → viewerCanRunEdit false", async () => {
    expect((await toWorkflowDetail(gmail, "other")).viewerCanRunEdit).toBe(false);
  });
  it("detail: account-only → not private, runnable by anyone", async () => {
    const d = await toWorkflowDetail(slack, "other");
    expect(d.usesPrivateCredential).toBe(false);
    expect(d.viewerCanRunEdit).toBe(true);
  });
  it("list item: same booleans, only id+name+counts shape (no createdByUserId)", () => {
    const item = toWorkflowListItem(gmail, new Map(), "other");
    expect(item.usesPrivateCredential).toBe(true);
    expect(item.viewerCanRunEdit).toBe(false);
    expect(item).not.toHaveProperty("createdByUserId");
    expect(item).not.toHaveProperty("draftDefinition");
  });
});
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
  // TRIGGER_REGISTRATION_FAILED is intentionally excluded here — it is the one
  // code whose message/details wrap a raw provider error and is redacted at the
  // response boundary (covered by the dedicated no-leak block below).
  const cases: ReadonlyArray<[LifecycleError["code"], number]> = [
    ["WORKFLOW_NOT_FOUND", 404],
    ["INVALID_TRANSITION", 409],
    ["LIFECYCLE_CONFLICT", 409],
    ["MISSING_PRECONDITIONS", 422],
  ];
  it.each(cases)("%s -> HTTP %i (message + details passed through)", async (code, expectedStatus) => {
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

describe("lifecycleErrorResponse — TRIGGER_REGISTRATION_FAILED no-leak (V2-READY-20)", () => {
  // The orchestrator builds this code by wrapping the raw provider/integration
  // error: message = "Trigger registration failed during 'activate': <raw>",
  // details = { cause: <raw> }. The raw text can carry the provider account id
  // (Gmail mailbox/email), the internal V2 account id, scopes, or a raw provider
  // error body. None of that may reach the client. See the throw shapes in
  // services/oauth/refreshAndRetry.ts + services/triggers/lifecycle.ts.
  const LEAKY_MAILBOX = "alice@example.com";
  const LEAKY_ACCOUNT_ID = "acct-3f2c9a10-dead-beef-0000-000000000001";
  const RAW =
    `Integration action required: refresh_failed (account=${LEAKY_ACCOUNT_ID}, provider=gmail, provider-account=${LEAKY_MAILBOX}).`;

  function leakyError(): LifecycleError {
    return new LifecycleError(
      "TRIGGER_REGISTRATION_FAILED",
      `Trigger registration failed during 'activate': ${RAW}`,
      { cause: RAW },
    );
  }

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns 502 + stable code with a safe static message and NO details", async () => {
    const res = lifecycleErrorResponse(leakyError());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_REGISTRATION_FAILED");
    // Static, identifier-free user message — NOT the raw/wrapped message.
    expect(body.error).toBe(
      "Couldn't register this workflow's trigger with the provider. Check the connection and try again.",
    );
    expect(body).not.toHaveProperty("details");
  });

  it("the serialized client body contains NONE of the raw identifiers", async () => {
    const res = lifecycleErrorResponse(leakyError());
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain(LEAKY_MAILBOX);
    expect(serialized).not.toContain(LEAKY_ACCOUNT_ID);
    expect(serialized).not.toContain("provider-account");
    expect(serialized).not.toContain("refresh_failed");
    expect(serialized).not.toContain("cause");
  });

  it("preserves the raw cause server-side only (structured console.error), never to the client", async () => {
    lifecycleErrorResponse(leakyError());
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0]?.[0] ?? "");
    // Diagnostics are retained in the SERVER log (not the response).
    expect(logged).toContain("workflow.lifecycle.trigger_registration_failed");
    expect(logged).toContain(LEAKY_MAILBOX);
  });

  it("through runLifecycle: a thrown TRIGGER_REGISTRATION_FAILED is redacted end-to-end", async () => {
    const res = await runLifecycle(
      async () => {
        throw leakyError();
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(502);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain(LEAKY_MAILBOX);
    expect(serialized).not.toContain(LEAKY_ACCOUNT_ID);
    expect(serialized).toContain("TRIGGER_REGISTRATION_FAILED");
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

  it("falls back to a SAFE static 500 for unexpected errors (V2-READY-22 — no raw message)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await runLifecycle(
      async () => {
        throw new Error("boom: raw internal detail");
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    // Stable, identifier-free message — NOT the raw thrown text.
    expect(body.error).toBe("Workflow action failed.");
    expect(body).not.toHaveProperty("code"); // codeless → client maps via status (SERVER_ERROR)
    // Diagnostics retained server-side only.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("V2-READY-22: a hostile unexpected error leaks NONE of its identifiers to the client", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // Packs every no-leak class: AccountFrozenError-style account id, Supabase
    // constraint/table, provider-account email, token, scope, and stack-ish text.
    const HOSTILE =
      "Account acct-9f2c1b00-dead-beef is pending deletion and is frozen; " +
      'duplicate key violates unique constraint "workflows_pkey" ' +
      "provider-account=dave@example.com token=ya29.SECRET scope=read:all " +
      "at applyTransition (/srv/app/repositories/workflows.ts:88:11)";
    const res = await runLifecycle(
      async () => {
        throw new Error(HOSTILE);
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(500);
    const raw = await res.text();
    expect(JSON.parse(raw).error).toBe("Workflow action failed.");
    for (const frag of [
      "acct-9f2c1b00-dead-beef",
      "workflows_pkey",
      "constraint",
      "dave@example.com",
      "ya29.SECRET",
      "read:all",
      "repositories/workflows.ts",
    ]) {
      expect(raw).not.toContain(frag);
    }
    // The raw cause is retained in the SERVER log (not the response).
    const logged = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("workflow.lifecycle.unexpected_error");
    expect(logged).toContain("dave@example.com");
    errorSpy.mockRestore();
  });

  it("V2-READY-22: a non-Error throw also collapses to the safe 500 message", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await runLifecycle(
      async () => {
        throw "raw string boom";
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Workflow action failed.");
    errorSpy.mockRestore();
  });

  it("V2-READY-23: AccountFrozenError → typed 403 ACCOUNT_PENDING_DELETION (no account-id leak)", async () => {
    // activate() throws this via assertAccountOperational; its raw message embeds
    // the account id. The lifecycle catch must map it to the standardized 403.
    const FROZEN_ACCOUNT = "acct-9f2c1b00-dead-beef";
    const res = await runLifecycle(
      async () => {
        throw new AccountFrozenError(FROZEN_ACCOUNT);
      },
      () => NextResponse.json({}),
    );
    expect(res.status).toBe(403);
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(body.code).toBe("ACCOUNT_PENDING_DELETION");
    expect(body.error).toBe("This account is pending deletion.");
    // The raw AccountFrozenError.message ("Account <id> is pending deletion...")
    // and the account id itself must NOT appear in the client response.
    expect(raw).not.toContain(FROZEN_ACCOUNT);
    expect(raw).not.toContain("is frozen");
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
      createdByUserId: "user-1",
      accountId: "acct-user-1",
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
      folderId: null,
      deletedByUserId: null,
      purgeAfter: null,
      deletedFromFolderId: null,
      deleteOperationId: null,
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
    // WF-3 added folder/trash columns to WorkflowRecord; toWorkflowSummary must
    // NOT leak them onto the wire shape.
    expect(summary).not.toHaveProperty("folderId");
    expect(summary).not.toHaveProperty("deleteOperationId");
    expect(summary).not.toHaveProperty("activeRevisionId");
    expect(summary).not.toHaveProperty("draftDefinition");
  });
});

describe("toWorkflowDetail", () => {
  it("includes activeRevisionId + draftDefinition; still strips userId", async () => {
    const record: WorkflowRecord = {
      id: "wf-1",
      createdByUserId: "user-1",
      accountId: "acct-user-1",
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
      folderId: null,
      deletedByUserId: null,
      purgeAfter: null,
      deletedFromFolderId: null,
      deleteOperationId: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T01:00:00Z",
    };
    const detail = await toWorkflowDetail(record, "user-1");
    expect(detail.activeRevisionId).toBe("rev-1");
    expect(detail.draftDefinition.nodes[0]?.id).toBe("n1");
    expect(detail.draftDefinition.edges).toEqual([]);
    expect(detail).not.toHaveProperty("userId");
  });
});

describe("toWorkflowDetail — unpublishedChanges (V2-READY-41G; flag removed 41H)", () => {
  beforeEach(() => {
    mockHasDraftDrift.mockReset();
  });

  it("active + drift: unpublishedChanges true", async () => {
    mockHasDraftDrift.mockResolvedValueOnce(true);
    const detail = await toWorkflowDetail(recordWith({ state: "active" }), "creator-1");
    expect(detail.unpublishedChanges).toBe(true);
  });

  it("active + no drift: unpublishedChanges false", async () => {
    mockHasDraftDrift.mockResolvedValueOnce(false);
    const detail = await toWorkflowDetail(recordWith({ state: "active" }), "creator-1");
    expect(detail.unpublishedChanges).toBe(false);
  });

  it("NON-active workflow: false, drift not computed (only active workflows publish)", async () => {
    const detail = await toWorkflowDetail(recordWith({ state: "paused" }), "creator-1");
    expect(detail.unpublishedChanges).toBe(false);
    expect(mockHasDraftDrift).not.toHaveBeenCalled();
  });
});

describe("toWorkflowRunSummary", () => {
  const triggerEvent: TriggerEvent = {
    provider: "slack",
    eventType: "message",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    providerAccountId: "T0001",
    payload: { text: "secret" },
  };

  const baseRecord: WorkflowRunRecord = {
    id: "11111111-1111-1111-1111-111111111111",
    workflowId: "22222222-2222-2222-2222-222222222222",
    accountId: "acct-1",
    triggeredByUserId: "user-1",
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
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
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
//
// V2-READY-51 (Option C): per-step OUTPUT is exposed ONLY to the run's own
// author viewing their TEST run. The SEC-7 redaction tests below therefore run
// against an AUTHOR-TEST record (isTest:true, triggeredByUserId === RUN_AUTHOR)
// and pass RUN_AUTHOR as the caller — the one path where output is shown (and
// then sensitive-field-redacted). The gating itself (non-test / co-member → NO
// output; never triggerEvent/fatalError) is covered in its own block further
// down.
const RUN_AUTHOR = "user-1";
describe("toWorkflowRunDetail — Slice 3.SEC-7 sensitive-output redaction", () => {
  const triggerEvent: TriggerEvent = {
    provider: "native",
    eventType: "manual.run",
    eventId: "ev-1",
    occurredAt: "2026-05-22T00:00:00Z",
    providerAccountId: "system",
    payload: { inputs: {} },
  };

  function makeRecord(
    steps: WorkflowRunRecord["steps"],
  ): WorkflowRunRecord {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      workflowId: "22222222-2222-2222-2222-222222222222",
      accountId: "acct-1",
      triggeredByUserId: RUN_AUTHOR,
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps,
      fatalError: null,
      errorClassification: null,
      startedAt: "2026-05-22T00:00:00Z",
      finishedAt: "2026-05-22T00:00:01Z",
      createdAt: "2026-05-22T00:00:00Z",
      // Author-test run — the one context where per-step output is exposed.
      isTest: true,
      triggeredBy: "test",
      triggeredByApiKeyId: null,
      triggeredByApiKeyPrefix: null,
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
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
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
    const custOut = detail.steps[0]!.output as Record<string, unknown>;
    const fmtOut = detail.steps[1]!.output as Record<string, unknown>;
    expect(custOut.email).toBe(REDACTED_SENTINEL);
    expect(fmtOut.formatted).toBe("ok");
  });

  // ─── V2-READY-2 — step ERROR diagnostics no-leak ──────────────────────────
  // The stored step error message is the RAW thrown text; the detail endpoint
  // (builder RunResultsPanel) must surface only a stable code + humanized,
  // identifier-free message — never providerAccountId / integration id / account
  // id / token / scope / email / raw provider body.
  it("V2-READY-2: sanitizes a raw HANDLER_FAILED message — no providerAccountId / account id / email / token leak", () => {
    const record = makeRecord([
      {
        nodeId: "a1",
        status: "failed",
        error: {
          code: "HANDLER_FAILED",
          message:
            `Integration action required: refresh_failed (account=acct-secret-99, provider=slack, provider-account=T-LEAK-123, email=bob@corp.com, token=${(["xoxb", "9f8a", "secret"].join("-"))}).`,
        },
      },
    ]);
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR);
    const stepErr = detail.steps[0]!.error!;
    expect(stepErr.code).toBe("HANDLER_FAILED");
    const serialized = JSON.stringify(stepErr);
    for (const leak of [
      "acct-secret-99",
      "T-LEAK-123",
      "bob@corp.com",
      (["xoxb", "9f8a", "secret"].join("-")),
      "provider-account=",
    ]) {
      expect(serialized).not.toContain(leak);
    }
    // A safe, code-derived message replaces the raw thrown text; details dropped.
    expect(stepErr.message).toBe("Workflow step failed");
    expect("details" in stepErr).toBe(false);
  });

  it("V2-READY-2: humanizes a Slack handler error safely (drops the raw 'chat.postMessage failed' string)", () => {
    const record = makeRecord([
      {
        nodeId: "a1",
        status: "failed",
        error: { code: "HANDLER_FAILED", message: "Slack chat.postMessage failed: channel_not_found" },
      },
    ]);
    const stepErr = toWorkflowRunDetail(record, RUN_AUTHOR).steps[0]!.error!;
    expect(stepErr.code).toBe("HANDLER_FAILED");
    expect(stepErr.message).not.toContain("chat.postMessage");
    expect(stepErr.message.toLowerCase()).toContain("channel");
  });

  it("V2-READY-2: MISSING_VARIABLE keeps the safe {{path}} in a humanized message and drops raw details", () => {
    const record = makeRecord([
      {
        nodeId: "a1",
        status: "failed",
        error: {
          code: "MISSING_VARIABLE",
          message: "Missing variable: trigger.unknown",
          details: { path: "trigger.unknown", reason: "missing_field" },
        },
      },
    ]);
    const stepErr = toWorkflowRunDetail(record, RUN_AUTHOR).steps[0]!.error!;
    expect(stepErr.code).toBe("MISSING_VARIABLE");
    // The user's own template reference is safe + useful; raw details are dropped.
    expect(stepErr.message).toContain("trigger.unknown");
    expect("details" in stepErr).toBe(false);
  });

  it("V2-READY-2: a raw provider error body (token / email / scope / oauth code) is not surfaced", () => {
    const record = makeRecord([
      {
        nodeId: "a1",
        status: "failed",
        error: {
          code: "HANDLER_FAILED",
          message:
            '{"error":"invalid_grant","access_token":"ya29.SECRET","email":"svc@acme.com","scope":"https://www.googleapis.com/auth/gmail.send"}',
        },
      },
    ]);
    const serialized = JSON.stringify(toWorkflowRunDetail(record, RUN_AUTHOR).steps[0]!.error);
    for (const leak of ["ya29.SECRET", "svc@acme.com", "gmail.send", "access_token", "invalid_grant"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("V2-READY-2: does NOT mutate the persisted record's step error (raw stays in the DB record)", () => {
    const original = { code: "HANDLER_FAILED", message: `raw token=${(["xoxb", "keep", "in", "db"].join("-"))}` };
    const record = makeRecord([{ nodeId: "a1", status: "failed", error: original }]);
    toWorkflowRunDetail(record, RUN_AUTHOR);
    expect(record.steps[0]!.error).toBe(original);
    expect(original.message).toBe(`raw token=${(["xoxb", "keep", "in", "db"].join("-"))}`);
  });

  // ─── V2-READY-9 — BOTH sanitizers fire on ONE run-detail response ──────────
  // The serializer redacts sensitive step OUTPUTS (SEC-7) and sanitizes raw step
  // ERRORS (V2-READY-2) in the same `steps.map` (_shared.ts:517 + :519). The
  // existing tests above cover each in isolation — output redaction on
  // succeeded-only records, error sanitization on failed-only records. These pin
  // the core-loop guarantee that a single run carrying BOTH a sensitive output
  // AND a leaky error gets both protections together, with no cross-step leak.
  it("V2-READY-9: redacts a sensitive output AND sanitizes a leaky error in the same response", () => {
    const record = makeRecord([
      {
        nodeId: "cust-node",
        status: "succeeded",
        output: { customerId: "cus_1", email: "alice@example.com", name: "Alice" },
      },
      {
        nodeId: "a1",
        status: "failed",
        error: {
          code: "HANDLER_FAILED",
          message:
            `Integration action required: refresh_failed (account=acct-secret-99, provider=slack, provider-account=T-LEAK-123, email=bob@corp.com, token=${(["xoxb", "9f8a", "secret"].join("-"))}).`,
        },
      },
    ]);
    const nodes = [makeNode("cust-node", "stripe", "create_customer")];

    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);

    // Output redaction (SEC-7) on the succeeded step.
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.email).toBe(REDACTED_SENTINEL);
    expect(out.customerId).toBe("cus_1"); // non-sensitive field preserved

    // Error sanitization (V2-READY-2) on the failed step.
    const stepErr = detail.steps[1]!.error!;
    expect(stepErr.code).toBe("HANDLER_FAILED");
    expect(stepErr.message).toBe("Workflow step failed");
    expect("details" in stepErr).toBe(false);

    // Combined no-leak: NEITHER step's secrets appear anywhere in the response.
    const serialized = JSON.stringify(detail);
    for (const leak of [
      "alice@example.com",
      "acct-secret-99",
      "T-LEAK-123",
      "bob@corp.com",
      (["xoxb", "9f8a", "secret"].join("-")),
      "provider-account=",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("V2-READY-9: a missing-connection HANDLER_FAILED (refreshAndRetry account/email leak) is sanitized to the safe title", () => {
    // The engine's real missing-connection throw embeds the account id +
    // provider-account in the message (services/oauth/refreshAndRetry.ts). On the
    // detail surface it must collapse to the safe generic title — never the ids.
    const record = makeRecord([
      {
        nodeId: "a1",
        status: "failed",
        error: {
          code: "HANDLER_FAILED",
          message:
            "refreshAndRetry: no active integration for account acct-leak-42 provider gmail (providerAccountId=svc@acme.com).",
        },
      },
    ]);
    const stepErr = toWorkflowRunDetail(record, RUN_AUTHOR).steps[0]!.error!;
    expect(stepErr.code).toBe("HANDLER_FAILED");
    expect(stepErr.message).toBe("Workflow step failed");
    const serialized = JSON.stringify(stepErr);
    for (const leak of ["acct-leak-42", "svc@acme.com", "providerAccountId"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  // ─── Slice 3.POSTSEC-2 — newly-sensitive arrays/objects redact ────────────
  //
  // Cover the four POSTSEC-2 categories from the audit: a Stripe object
  // projection (find_payment_intent), a Gmail messages array, a Slack
  // messages array, and a Notion search results array. Each test confirms
  // the previously-leaking output now redacts to REDACTED_SENTINEL AND
  // the original persisted record is not mutated.
  it("POSTSEC-2: stripe:find_payment_intent.paymentIntent redacts to REDACTED_SENTINEL", () => {
    const originalOutput = {
      found: true,
      paymentIntent: {
        paymentIntentId: "pi_1",
        amount: 2099,
        receiptEmail: "alice@example.com",
        metadata: { order_id: "ord_42" },
      },
    };
    const record = makeRecord([
      { nodeId: "find-pi-node", status: "succeeded", output: originalOutput },
    ]);
    const nodes = [makeNode("find-pi-node", "stripe", "find_payment_intent")];
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.found).toBe(true);
    expect(out.paymentIntent).toBe(REDACTED_SENTINEL);
    // Immutability — the persisted record still carries the original object.
    expect(originalOutput.paymentIntent.receiptEmail).toBe("alice@example.com");
  });

  it("POSTSEC-2: gmail:search_emails.messages redacts to REDACTED_SENTINEL", () => {
    const originalOutput = {
      query: "subject:invoice",
      messages: [
        { messageId: "m1", subject: "Invoice #1", from: "alice@example.com" },
        { messageId: "m2", subject: "Invoice #2", from: "bob@example.com" },
      ],
      count: 2,
      hasMore: false,
    };
    const record = makeRecord([
      { nodeId: "search-node", status: "succeeded", output: originalOutput },
    ]);
    const nodes = [makeNode("search-node", "gmail", "search_emails")];
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.messages).toBe(REDACTED_SENTINEL);
    // Non-sensitive siblings remain visible.
    expect(out.query).toBe("subject:invoice");
    expect(out.count).toBe(2);
    expect(out.hasMore).toBe(false);
    // Immutability — the original messages array still carries the data.
    expect(originalOutput.messages).toHaveLength(2);
  });

  it("POSTSEC-2: slack:get_messages.messages redacts to REDACTED_SENTINEL", () => {
    const originalOutput = {
      messages: [
        { ts: "1700000001.000100", text: "secret-channel-message", user: "U1" },
      ],
      count: 1,
      hasMore: false,
      nextCursor: "",
    };
    const record = makeRecord([
      { nodeId: "get-msg-node", status: "succeeded", output: originalOutput },
    ]);
    const nodes = [makeNode("get-msg-node", "slack", "get_messages")];
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.messages).toBe(REDACTED_SENTINEL);
    expect(out.count).toBe(1);
    expect(out.hasMore).toBe(false);
    expect(out.nextCursor).toBe("");
  });

  it("POSTSEC-2: notion:search.results redacts to REDACTED_SENTINEL", () => {
    const originalOutput = {
      results: [
        { id: "page-1", object: "page", url: "https://notion.so/abc" },
        { id: "db-1", object: "database", url: "https://notion.so/def" },
      ],
      hasMore: false,
      nextCursor: null,
    };
    const record = makeRecord([
      { nodeId: "search-node", status: "succeeded", output: originalOutput },
    ]);
    const nodes = [makeNode("search-node", "notion", "search")];
    const detail = toWorkflowRunDetail(record, RUN_AUTHOR, nodes);
    const out = detail.steps[0]!.output as Record<string, unknown>;
    expect(out.results).toBe(REDACTED_SENTINEL);
    expect(out.hasMore).toBe(false);
    expect(out.nextCursor).toBe(null);
    expect(originalOutput.results).toHaveLength(2);
  });
});

// ── V2-READY-51 (Option C) — per-step output gating + payload omission ───────
//
// The run-detail DTO exposes per-step OUTPUT only to the run's own author
// viewing their TEST run. Everyone else (a co-member, or any real/non-test run)
// gets status-only steps + sanitized errors. The DTO NEVER carries the raw
// triggerEvent or the raw fatalError; the humanized errorClassification (from
// the summary) is the failure surface.
describe("toWorkflowRunDetail — V2-READY-51 output gating + payload omission", () => {
  const triggerEvent: TriggerEvent = {
    provider: "native",
    eventType: "manual.run",
    eventId: "ev-1",
    occurredAt: "2026-05-22T00:00:00Z",
    providerAccountId: "system",
    payload: { secret: "trigger-body" },
  };

  function record(over: Partial<WorkflowRunRecord>): WorkflowRunRecord {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      workflowId: "22222222-2222-2222-2222-222222222222",
      accountId: "acct-1",
      triggeredByUserId: RUN_AUTHOR,
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps: [{ nodeId: "a1", status: "succeeded", output: { token: "sk-leak-42" } }],
      fatalError: { code: "HANDLER_FAILED", message: "raw fatal boom" },
      errorClassification: {
        title: "Step failed",
        description: "Something went wrong.",
        severity: "error",
      },
      startedAt: "2026-05-22T00:00:00Z",
      finishedAt: "2026-05-22T00:00:01Z",
      createdAt: "2026-05-22T00:00:00Z",
      isTest: true,
      triggeredBy: "test",
      triggeredByApiKeyId: null,
      triggeredByApiKeyPrefix: null,
      ...over,
    };
  }

  const node: WorkflowNode = {
    id: "a1",
    kind: "action",
    provider: "native",
    type: "http_request",
    config: {},
    position: { x: 0, y: 0 },
  };

  it("author viewing their TEST run → step output IS present", () => {
    const detail = toWorkflowRunDetail(record({}), RUN_AUTHOR, [node]);
    expect(detail.steps[0]!.output).toBeDefined();
  });

  it("author's REAL (non-test) run → step output OMITTED (and not on the wire)", () => {
    const detail = toWorkflowRunDetail(
      record({ isTest: false, triggeredBy: "manual" }),
      RUN_AUTHOR,
      [node],
    );
    expect("output" in detail.steps[0]!).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("sk-leak-42");
  });

  it("CO-MEMBER viewing the author's test run → step output OMITTED", () => {
    const detail = toWorkflowRunDetail(record({}), "other-member", [node]);
    expect("output" in detail.steps[0]!).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("sk-leak-42");
  });

  it("test run with a NULL actor (no author) → step output OMITTED", () => {
    const detail = toWorkflowRunDetail(
      record({ triggeredByUserId: null }),
      RUN_AUTHOR,
      [node],
    );
    expect("output" in detail.steps[0]!).toBe(false);
  });

  it("NEVER exposes raw triggerEvent or fatalError (author-test included)", () => {
    const detail = toWorkflowRunDetail(record({}), RUN_AUTHOR, [node]);
    expect("triggerEvent" in detail).toBe(false);
    expect("fatalError" in detail).toBe(false);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("trigger-body");
    expect(serialized).not.toContain("raw fatal boom");
  });

  it("real run still carries step status + sanitized error + humanized classification", () => {
    const failing = record({
      isTest: false,
      triggeredBy: "manual",
      status: "failed",
      steps: [
        {
          nodeId: "a1",
          status: "failed",
          error: { code: "HANDLER_FAILED", message: "raw token=sk-leak-42" },
        },
      ],
    });
    const detail = toWorkflowRunDetail(failing, RUN_AUTHOR);
    expect(detail.steps[0]!.status).toBe("failed");
    expect(detail.steps[0]!.error!.code).toBe("HANDLER_FAILED");
    expect("output" in detail.steps[0]!).toBe(false);
    // Raw error text is humanized away; the humanized classification survives.
    expect(JSON.stringify(detail)).not.toContain("sk-leak-42");
    expect(detail.errorClassification).not.toBeNull();
  });
});
