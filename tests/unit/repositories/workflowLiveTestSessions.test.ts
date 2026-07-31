/**
 * @jest-environment node
 *
 * repositories/liveTest/workflowLiveTestSessions — the guarded-query construction.
 *
 * The database is the concurrency authority; what THESE tests pin is that the repository
 * actually builds the guards it claims: status compare-and-set predicates sourced from the
 * lifecycle's exported sets (so repo and lifecycle cannot drift), 23505 → typed
 * active_session_exists, RPC outcome mapping, cancel idempotency, and the illegal-transition
 * pre-check that refuses before any SQL is issued.
 */

interface Captured {
  updates: Record<string, unknown> | null;
  inserts: Record<string, unknown> | null;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
  iss: Array<[string, unknown]>;
  gts: Array<[string, unknown]>;
  ltes: Array<[string, unknown]>;
  nots: Array<[string, string, unknown]>;
  rpc: { fn: string; args: Record<string, unknown> } | null;
}
const cap: Captured = { updates: null, inserts: null, eqs: [], ins: [], iss: [], gts: [], ltes: [], nots: [], rpc: null };
const state: { result: { data: unknown; error: { code?: string; message: string } | null } } = {
  result: { data: null, error: null },
};

function resetCaptured(): void {
  Object.assign(cap, { updates: null, inserts: null, eqs: [], ins: [], iss: [], gts: [], ltes: [], nots: [], rpc: null });
  state.result = { data: null, error: null };
}

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  const chain = (fn: (...a: never[]) => void) => (...a: never[]) => { fn(...a); return b; };
  Object.assign(b, {
    insert: chain((p: Record<string, unknown>) => { cap.inserts = p; }),
    update: chain((p: Record<string, unknown>) => { cap.updates = p; }),
    select: chain(() => {}),
    order: chain(() => {}),
    limit: chain(() => {}),
    eq: chain((c: string, v: unknown) => cap.eqs.push([c, v])),
    in: chain((c: string, v: unknown[]) => cap.ins.push([c, v])),
    is: chain((c: string, v: unknown) => cap.iss.push([c, v])),
    gt: chain((c: string, v: unknown) => cap.gts.push([c, v])),
    lte: chain((c: string, v: unknown) => cap.ltes.push([c, v])),
    not: chain((c: string, op: string, v: unknown) => cap.nots.push([c, op, v])),
    maybeSingle: async () => state.result,
    single: async () => state.result,
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(state.result).then(onFulfilled),
  });
  return b;
}

jest.mock("../../../repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => builder()),
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      cap.rpc = { fn, args };
      return state.result;
    }),
  })),
}));

import * as repo from "@/repositories/liveTest/workflowLiveTestSessions";
import {
  ACTIVE_LIVE_TEST_STATUSES,
  PRE_EXECUTION_LIVE_TEST_STATUSES,
} from "@/core/workflows/liveTest/liveTestSessionLifecycle";

const ROW = {
  id: "sess-1", account_id: "acct-1", user_id: "user-1", workflow_id: "wf-1",
  definition_hash: "hash", trigger_node_id: "trigger", trigger_provider: "gmail",
  trigger_event_type: "new_email", connection_ids: ["int-1"], status: "awaiting_consent",
  capture_baseline: null, captured_event: null, trigger_preview: null, nonce: "n",
  expires_at: "2026-08-01T10:10:00Z", consented_at: null, trigger_captured_at: null,
  execution_authorized_at: null, cancelled_at: null, consumed_at: null,
  workflow_run_id: null, failure_code: null, failure_message: null,
  created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T10:00:00Z",
};

beforeEach(resetCaptured);

describe("create — one-active constraint mapping", () => {
  it("maps 23505 to the typed active_session_exists refusal", async () => {
    state.result = { data: null, error: { code: "23505", message: "duplicate key" } };
    const r = await repo.createAwaitingConsentSession({
      accountId: "acct-1", userId: "user-1", workflowId: "wf-1", definitionHash: "h",
      triggerNodeId: "trigger", triggerProvider: "gmail", triggerEventType: "new_email",
      connectionIds: [], nonce: "n", expiresAt: "2026-08-01T10:10:00Z",
    });
    expect(r).toEqual({ ok: false, reason: "active_session_exists" });
    expect(cap.inserts).toMatchObject({ status: "awaiting_consent", nonce: "n" });
  });
});

describe("guarded transitions — the WHERE clauses are the safety property", () => {
  it("startListening guards on awaiting_consent + exact hash + not cancelled + unexpired", async () => {
    state.result = { data: { ...ROW, status: "waiting_for_trigger" }, error: null };
    await repo.startListening({
      sessionId: "sess-1", expectedDefinitionHash: "hash",
      captureBaseline: { from: "t0" }, consentedAt: "t1", expiresAt: "t2",
    });
    expect(cap.eqs).toEqual(expect.arrayContaining([
      ["id", "sess-1"], ["status", "awaiting_consent"], ["definition_hash", "hash"],
    ]));
    expect(cap.iss).toEqual([["cancelled_at", null]]);
    expect(cap.gts.map(([c]) => c)).toEqual(["expires_at"]);
    expect(cap.updates).toMatchObject({ status: "waiting_for_trigger", capture_baseline: { from: "t0" } });
  });

  it("recordCapturedTrigger guards on waiting_for_trigger + not cancelled + unexpired", async () => {
    state.result = { data: { ...ROW, status: "trigger_received" }, error: null };
    await repo.recordCapturedTrigger({
      sessionId: "sess-1",
      capturedEvent: { provider: "gmail", eventType: "new_email", eventId: "e", occurredAt: "t", providerAccountId: "p", payload: {} },
      triggerPreview: { subject: "s" },
      capturedAt: "t3",
    });
    expect(cap.eqs).toEqual(expect.arrayContaining([["status", "waiting_for_trigger"]]));
    expect(cap.iss).toEqual([["cancelled_at", null]]);
    expect(cap.gts.map(([c]) => c)).toEqual(["expires_at"]);
  });

  it("getActiveSessionForWorkflow filters by the lifecycle's ACTIVE set (no drift)", async () => {
    state.result = { data: null, error: null };
    await repo.getActiveSessionForWorkflow("wf-1");
    expect(cap.ins).toEqual([["status", [...ACTIVE_LIVE_TEST_STATUSES]]]);
  });

  it("cancelSession's guard is EXACTLY the pre-execution set — running/terminal can never match", async () => {
    state.result = { data: { ...ROW, status: "cancelled" }, error: null };
    await repo.cancelSession({ sessionId: "sess-1", accountId: "acct-1" });
    expect(cap.ins).toEqual([["status", [...PRE_EXECUTION_LIVE_TEST_STATUSES]]]);
    expect(cap.eqs).toEqual(expect.arrayContaining([["account_id", "acct-1"]]));
  });

  it("expireEligibleSessions sweeps only pre-execution sessions past their TTL", async () => {
    state.result = { data: [], error: null };
    await repo.expireEligibleSessions("2026-08-01T11:00:00Z");
    expect(cap.ins).toEqual([["status", [...PRE_EXECUTION_LIVE_TEST_STATUSES]]]);
    expect(cap.ltes).toEqual([["expires_at", "2026-08-01T11:00:00Z"]]);
    expect(cap.updates).toEqual({ status: "expired" });
  });

  it("completeSessionForRun is keyed by run id AND guarded on status='running'", async () => {
    state.result = { data: null, error: null };
    await repo.completeSessionForRun({ runId: "run-1", succeeded: false });
    expect(cap.eqs).toEqual(expect.arrayContaining([["workflow_run_id", "run-1"], ["status", "running"]]));
    expect(cap.updates).toMatchObject({ status: "failed", failure_code: "run_failed" });
  });

  it("failSession refuses an illegal from-status BEFORE issuing any SQL", async () => {
    state.result = { data: ROW, error: null };
    const r = await repo.failSession({
      sessionId: "sess-1", failureCode: "internal_error", failureMessage: "x",
      fromStatuses: ["succeeded"], // terminal → failed is illegal in the lifecycle
    });
    expect(r.ok).toBe(false);
    expect(cap.updates).toBeNull(); // no UPDATE was built
  });

  it("getConsumedSessionByRunId requires consumed_at NOT NULL (only a claimed session is a capability)", async () => {
    state.result = { data: null, error: null };
    await repo.getConsumedSessionByRunId("run-1");
    expect(cap.eqs).toEqual(expect.arrayContaining([["workflow_run_id", "run-1"]]));
    expect(cap.nots).toEqual([["consumed_at", "is", null]]);
  });
});

describe("authorizeExecution — RPC outcome mapping", () => {
  it("calls authorize_live_test_run with the session/run/enqueue triple", async () => {
    state.result = { data: [{ outcome: "authorized", run_id: "run-9" }], error: null };
    const r = await repo.authorizeExecution({ sessionId: "sess-1", runId: "run-9", enqueuedAt: "t" });
    expect(cap.rpc).toEqual({
      fn: "authorize_live_test_run",
      args: { p_session_id: "sess-1", p_run_id: "run-9", p_enqueued_at: "t" },
    });
    expect(r).toEqual({ ok: true, runId: "run-9", alreadyAuthorized: false });
  });

  it("maps already_authorized to the SAME-run convergence result", async () => {
    state.result = { data: [{ outcome: "already_authorized", run_id: "run-1" }], error: null };
    expect(await repo.authorizeExecution({ sessionId: "s", runId: "ignored", enqueuedAt: "t" }))
      .toEqual({ ok: true, runId: "run-1", alreadyAuthorized: true });
  });

  it.each(["not_found", "cancelled", "expired", "not_eligible", "missing_captured_event"] as const)(
    "maps refusal outcome %s to a typed failure",
    async (outcome) => {
      state.result = { data: [{ outcome, run_id: null }], error: null };
      expect(await repo.authorizeExecution({ sessionId: "s", runId: "r", enqueuedAt: "t" }))
        .toEqual({ ok: false, reason: outcome });
    },
  );

  it("an unknown outcome throws (fail closed) rather than guessing", async () => {
    state.result = { data: [{ outcome: "surprise", run_id: null }], error: null };
    await expect(repo.authorizeExecution({ sessionId: "s", runId: "r", enqueuedAt: "t" }))
      .rejects.toThrow(/unknown outcome/);
  });
});
