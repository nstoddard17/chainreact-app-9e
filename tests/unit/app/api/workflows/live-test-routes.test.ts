/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 §14 — the live-test API boundary:
 *   POST   /api/workflows/[id]/live-test                       (prepare)
 *   GET    /api/workflows/[id]/live-test/[sessionId]           (status)
 *   DELETE /api/workflows/[id]/live-test/[sessionId]           (cancel)
 *   POST   /api/workflows/[id]/live-test/[sessionId]/start     (explicit consent)
 *
 * Business rules under test:
 *   - Unauthenticated → 401; services never invoked.
 *   - Non-member / missing workflow → the standard 404 (no existence leak).
 *   - Prepare returns the disclosure + nonce and accepts NO authorization-shaped input.
 *   - Start takes EXACTLY { nonce } — a body smuggling allowRealCalls / recordAsTest /
 *     executionOrigin is a 400 before any service runs (the §9 "forged client request" gate).
 *   - Typed service refusals map to typed HTTP codes.
 *   - Capture submission and execution authorization have NO route at all.
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
const mockPrepare = jest.fn();
const mockStart = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/services/workflows/liveTest/sessionService", () => ({
  prepareLiveTestSession: (...a: unknown[]) => mockPrepare(...a),
  startLiveTestListening: (...a: unknown[]) => mockStart(...a),
  cancelLiveTestSession: (...a: unknown[]) => mockCancel(...a),
}));
// WORKFLOW-LIVE-TEST-4 — GET now performs one advancement tick via the orchestration service.
const mockAdvance = jest.fn();
jest.mock("@/services/workflows/liveTest/orchestrationService", () => ({
  advanceLiveTestSession: (...a: unknown[]) => mockAdvance(...a),
}));
const mockProcessQueuedRun = jest.fn();
jest.mock("@/services/execution/runQueueProcessor", () => ({
  processQueuedRun: (...a: unknown[]) => mockProcessQueuedRun(...a),
}));
// The routes side-effect-import the full provider registry to populate the live-capture
// adapter registry; the route boundary under test doesn't need real providers loaded.
jest.mock("@/integrations/_registry", () => ({}));
// `after` requires a Next request scope; in tests it runs the task inline.
const mockAfter = jest.fn((task: unknown) => task);
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: (task: unknown) => mockAfter(task) };
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { POST as preparePost } from "@/app/api/workflows/[id]/live-test/route";
import {
  GET as statusGet,
  DELETE as cancelDelete,
} from "@/app/api/workflows/[id]/live-test/[sessionId]/route";
import { POST as startPost } from "@/app/api/workflows/[id]/live-test/[sessionId]/start/route";

const workflow = {
  id: "wf-1",
  accountId: "acct-1",
  createdByUserId: "user-1", // caller IS creator → run-edit gate short-circuits with no DB read
  name: "WF",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const params = (extra: Record<string, string> = {}) =>
  ({ params: Promise.resolve({ id: "wf-1", ...extra }) }) as {
    params: Promise<{ id: string; sessionId: string }>;
  };
const jsonRequest = (body: unknown) =>
  new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockGetById.mockResolvedValue(workflow);
  mockIsMember.mockResolvedValue(true);
});

describe("live-test routes — auth gate", () => {
  it("401 for an unauthenticated caller; no service is invoked", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const responses = [
      await preparePost(jsonRequest({}), params()),
      await statusGet(new Request("http://test.local"), params({ sessionId: "s1" })),
      await cancelDelete(new Request("http://test.local"), params({ sessionId: "s1" })),
      await startPost(jsonRequest({ nonce: "n" }), params({ sessionId: "s1" })),
    ];
    for (const r of responses) expect(r.status).toBe(401);
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockAdvance).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("non-member collapses to the standard 404 before the service runs (prepare)", async () => {
    mockIsMember.mockResolvedValue(false);
    const r = await preparePost(jsonRequest({}), params());
    expect(r.status).toBe(404);
    expect(mockPrepare).not.toHaveBeenCalled();
  });
});

describe("prepare route", () => {
  it("returns 201 with sessionId + nonce + disclosure, derived entirely server-side", async () => {
    mockPrepare.mockResolvedValue({
      ok: true,
      sessionId: "sess-1",
      nonce: "server-nonce",
      expiresAt: "2026-08-01T10:10:00Z",
      reused: false,
      disclosure: { effects: [], internalSteps: [], statements: [], disclosureDigest: "d" },
      trigger: { nodeId: "trigger", provider: "gmail", eventType: "new_email" },
    });
    const r = await preparePost(jsonRequest({ allowRealCalls: true }), params());
    expect(r.status).toBe(201);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.sessionId).toBe("sess-1");
    expect(body.nonce).toBe("server-nonce");
    // The service received ONLY server-derived identity — no client field passes through.
    expect(mockPrepare).toHaveBeenCalledWith({ workflowId: "wf-1", userId: "user-1" });
  });

  it.each([
    ["not_ready", 422, { reason: "not_ready", readiness: { error: "MISSING_REQUIRED_FIELDS", message: "x", gaps: [] } }],
    ["trigger_capture_unsupported", 422, { reason: "trigger_capture_unsupported", provider: "gmail", eventType: "new_email" }],
    ["session_in_progress", 409, { reason: "session_in_progress", sessionId: "s0", status: "waiting_for_trigger" }],
    ["integration_unavailable", 409, { reason: "integration_unavailable", provider: "gmail" }],
  ] as const)("maps %s to HTTP %d", async (_reason, httpStatus, refusal) => {
    mockPrepare.mockResolvedValue({ ok: false, ...refusal });
    const r = await preparePost(jsonRequest({}), params());
    expect(r.status).toBe(httpStatus);
  });
});

describe("start route — the strict consent boundary", () => {
  it("accepts EXACTLY { nonce } and forwards the server-derived identity", async () => {
    mockStart.mockResolvedValue({ ok: true, status: { sessionId: "s1" }, alreadyListening: false });
    const r = await startPost(jsonRequest({ nonce: "n-1" }), params({ sessionId: "s1" }));
    expect(r.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith({
      sessionId: "s1",
      workflowId: "wf-1",
      userId: "user-1",
      nonce: "n-1",
    });
  });

  it.each([
    ["allowRealCalls smuggled", { nonce: "n", allowRealCalls: true }],
    ["recordAsTest smuggled", { nonce: "n", recordAsTest: true }],
    ["executionOrigin smuggled", { nonce: "n", executionOrigin: "live_test" }],
    ["connection substitution smuggled", { nonce: "n", connectionIds: ["other"] }],
    ["missing nonce", {}],
  ])("rejects a forged body (%s) with 400 BEFORE any service runs", async (_name, body) => {
    const r = await startPost(jsonRequest(body), params({ sessionId: "s1" }));
    expect(r.status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_nonce", 403],
    ["stale_definition", 409],
    ["stale_connections", 409],
    ["session_expired", 409],
    ["session_cancelled", 409],
    ["baseline_failed", 502],
    ["session_not_found", 404],
  ] as const)("maps %s to HTTP %d", async (reason, httpStatus) => {
    mockStart.mockResolvedValue(
      reason === "baseline_failed" ? { ok: false, reason, retryable: true } : { ok: false, reason },
    );
    const r = await startPost(jsonRequest({ nonce: "n" }), params({ sessionId: "s1" }));
    expect(r.status).toBe(httpStatus);
  });
});

describe("status + cancel routes", () => {
  it("status returns the safe DTO from ONE advancement tick and 404s on a typed miss", async () => {
    mockAdvance.mockResolvedValue({
      ok: true,
      status: { sessionId: "s1", status: "waiting_for_trigger" },
      advisory: null,
      queuedRunId: null,
    });
    const ok = await statusGet(new Request("http://test.local"), params({ sessionId: "s1" }));
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { session: unknown; advisory?: unknown };
    expect(okBody.session).toEqual({ sessionId: "s1", status: "waiting_for_trigger" });
    expect(okBody.advisory).toBeUndefined();
    // The poll supplies ids only — the tick call carries no client-shaped payload.
    expect(mockAdvance).toHaveBeenCalledWith({
      sessionId: "s1",
      workflowId: "wf-1",
      userId: "user-1",
    });
    expect(mockAfter).not.toHaveBeenCalled();

    mockAdvance.mockResolvedValue({ ok: false, reason: "session_not_found" });
    const miss = await statusGet(new Request("http://test.local"), params({ sessionId: "nope" }));
    expect(miss.status).toBe(404);
  });

  it("a tick that authorized the run kicks the queue drain via after() and reports the run id", async () => {
    mockAdvance.mockResolvedValue({
      ok: true,
      status: { sessionId: "s1", status: "running", workflowRunId: "run-9" },
      advisory: null,
      queuedRunId: "run-9",
    });
    const r = await statusGet(new Request("http://test.local"), params({ sessionId: "s1" }));
    expect(r.status).toBe(200);
    expect(mockProcessQueuedRun).toHaveBeenCalledWith("run-9");
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("a typed advisory rides along with the honest status", async () => {
    mockAdvance.mockResolvedValue({
      ok: true,
      status: { sessionId: "s1", status: "trigger_received" },
      advisory: "usage_limit_reached",
      queuedRunId: null,
    });
    const r = await statusGet(new Request("http://test.local"), params({ sessionId: "s1" }));
    const body = (await r.json()) as { advisory?: string };
    expect(body.advisory).toBe("usage_limit_reached");
  });

  it("cancel maps execution_already_started to a 409 whose copy never claims rollback", async () => {
    mockCancel.mockResolvedValue({
      ok: false,
      reason: "execution_already_started",
      status: { sessionId: "s1", status: "running" },
    });
    const r = await cancelDelete(new Request("http://test.local"), params({ sessionId: "s1" }));
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/not rolled back/i);
    expect(body.error).not.toMatch(/undone|reverted successfully/i);
  });
});

describe("capture and authorization have NO browser route", () => {
  it("no route file exists for capture or authorize — they are internal services only", () => {
    const base = resolve(process.cwd(), "app/api/workflows/[id]/live-test");
    for (const forbidden of ["capture", "authorize", "[sessionId]/capture", "[sessionId]/authorize"]) {
      expect(existsSync(resolve(base, forbidden, "route.ts"))).toBe(false);
    }
  });
});
