/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 §16/§17 — the complete backend live-test flow, proven with a SYNTHETIC
 * capture adapter before any Gmail code exists:
 *
 *   prepare → disclosure → explicit start → waiting → trigger captured → atomic authorization →
 *   exactly one canonical queued run.
 *
 * The session repository is mocked as an IN-MEMORY implementation that honors the SAME guards
 * the real table enforces (one active session per workflow, status compare-and-set transitions,
 * consume-once authorization) — so the services are exercised against the semantics the database
 * was proven to have (the RPC + constraint behavior was validated directly against the applied
 * schema in migration 20260812000000's live probes). Everything else is mocked at its external
 * boundary: workflows repo, membership, billing reads, integrations. Readiness, fingerprint,
 * bindings, and disclosure run REAL.
 */

// ── in-memory session store honoring the DB guards ───────────────────────────
interface MemSession {
  id: string; account_id: string; user_id: string; workflow_id: string;
  definition_hash: string; trigger_node_id: string; trigger_provider: string;
  trigger_event_type: string; connection_ids: string[]; status: string;
  capture_baseline: Record<string, unknown> | null;
  captured_event: Record<string, unknown> | null;
  trigger_preview: Record<string, unknown> | null;
  nonce: string; expires_at: string; consented_at: string | null;
  trigger_captured_at: string | null; execution_authorized_at: string | null;
  cancelled_at: string | null; consumed_at: string | null;
  workflow_run_id: string | null; failure_code: string | null;
  failure_message: string | null; created_at: string; updated_at: string;
}
const ACTIVE = ["awaiting_consent", "waiting_for_trigger", "trigger_received", "authorizing_execution", "running"];
const PRE_EXEC = ["awaiting_consent", "waiting_for_trigger", "trigger_received", "authorizing_execution"];
const mem: { sessions: MemSession[]; runs: Array<{ id: string; sessionId: string }>; seq: number } = {
  sessions: [], runs: [], seq: 0,
};
const toRecord = (s: MemSession) => ({
  id: s.id, accountId: s.account_id, userId: s.user_id, workflowId: s.workflow_id,
  definitionHash: s.definition_hash, triggerNodeId: s.trigger_node_id,
  triggerProvider: s.trigger_provider, triggerEventType: s.trigger_event_type,
  connectionIds: s.connection_ids, status: s.status, captureBaseline: s.capture_baseline,
  capturedEvent: s.captured_event, triggerPreview: s.trigger_preview, nonce: s.nonce,
  expiresAt: s.expires_at, consentedAt: s.consented_at, triggerCapturedAt: s.trigger_captured_at,
  executionAuthorizedAt: s.execution_authorized_at, cancelledAt: s.cancelled_at,
  consumedAt: s.consumed_at, workflowRunId: s.workflow_run_id, failureCode: s.failure_code,
  failureMessage: s.failure_message, createdAt: s.created_at, updatedAt: s.updated_at,
});
const find = (id: string) => mem.sessions.find((s) => s.id === id);

jest.mock("@/repositories/liveTest/workflowLiveTestSessions", () => ({
  createAwaitingConsentSession: async (input: Record<string, unknown>) => {
    if (mem.sessions.some((s) => s.workflow_id === input.workflowId && ACTIVE.includes(s.status))) {
      return { ok: false, reason: "active_session_exists" };
    }
    const s: MemSession = {
      id: `sess-${++mem.seq}`, account_id: input.accountId as string, user_id: input.userId as string,
      workflow_id: input.workflowId as string, definition_hash: input.definitionHash as string,
      trigger_node_id: input.triggerNodeId as string, trigger_provider: input.triggerProvider as string,
      trigger_event_type: input.triggerEventType as string,
      connection_ids: [...(input.connectionIds as string[])], status: "awaiting_consent",
      capture_baseline: null, captured_event: null, trigger_preview: null,
      nonce: input.nonce as string, expires_at: input.expiresAt as string, consented_at: null,
      trigger_captured_at: null, execution_authorized_at: null, cancelled_at: null,
      consumed_at: null, workflow_run_id: null, failure_code: null, failure_message: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    mem.sessions.push(s);
    return { ok: true, session: toRecord(s) };
  },
  getSessionById: async (id: string) => { const s = find(id); return s ? toRecord(s) : null; },
  getActiveSessionForWorkflow: async (workflowId: string) => {
    const s = [...mem.sessions].reverse().find((x) => x.workflow_id === workflowId && ACTIVE.includes(x.status));
    return s ? toRecord(s) : null;
  },
  getConsumedSessionByRunId: async (runId: string) => {
    const s = mem.sessions.find((x) => x.workflow_run_id === runId && x.consumed_at !== null);
    return s ? toRecord(s) : null;
  },
  startListening: async (input: { sessionId: string; expectedDefinitionHash: string; captureBaseline: Record<string, unknown>; consentedAt: string; expiresAt: string }) => {
    const s = find(input.sessionId);
    if (!s || s.status !== "awaiting_consent" || s.definition_hash !== input.expectedDefinitionHash ||
        s.cancelled_at !== null || Date.parse(s.expires_at) <= Date.now()) {
      return { ok: false, reason: "conflict", current: s ? toRecord(s) : null };
    }
    Object.assign(s, { status: "waiting_for_trigger", consented_at: input.consentedAt, capture_baseline: input.captureBaseline, expires_at: input.expiresAt });
    return { ok: true, session: toRecord(s) };
  },
  recordCapturedTrigger: async (input: { sessionId: string; capturedEvent: Record<string, unknown>; triggerPreview: Record<string, unknown>; capturedAt: string }) => {
    const s = find(input.sessionId);
    if (!s || s.status !== "waiting_for_trigger" || s.cancelled_at !== null || Date.parse(s.expires_at) <= Date.now()) {
      return { ok: false, reason: "conflict", current: s ? toRecord(s) : null };
    }
    Object.assign(s, { status: "trigger_received", trigger_captured_at: input.capturedAt, captured_event: input.capturedEvent, trigger_preview: input.triggerPreview });
    return { ok: true, session: toRecord(s) };
  },
  authorizeExecution: async (input: { sessionId: string; runId: string; enqueuedAt: string }) => {
    // Mirrors authorize_live_test_run — the transaction proven live against the applied schema.
    const s = find(input.sessionId);
    if (!s) return { ok: false, reason: "not_found" };
    if (s.consumed_at !== null) return { ok: true, runId: s.workflow_run_id!, alreadyAuthorized: true };
    if (s.cancelled_at !== null || s.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (s.status === "expired" || Date.parse(s.expires_at) <= Date.now()) return { ok: false, reason: "expired" };
    if (s.status !== "trigger_received") return { ok: false, reason: "not_eligible" };
    if (s.captured_event === null) return { ok: false, reason: "missing_captured_event" };
    mem.runs.push({ id: input.runId, sessionId: s.id });
    Object.assign(s, { status: "running", consumed_at: input.enqueuedAt, execution_authorized_at: input.enqueuedAt, workflow_run_id: input.runId });
    return { ok: true, runId: input.runId, alreadyAuthorized: false };
  },
  completeSessionForRun: async (input: { runId: string; succeeded: boolean }) => {
    const s = mem.sessions.find((x) => x.workflow_run_id === input.runId && x.status === "running");
    if (s) Object.assign(s, input.succeeded ? { status: "succeeded" } : { status: "failed", failure_code: "run_failed" });
  },
  failSession: async (input: { sessionId: string; failureCode: string; failureMessage: string; fromStatuses: string[] }) => {
    const s = find(input.sessionId);
    if (!s || !input.fromStatuses.includes(s.status)) return { ok: false, reason: "conflict", current: s ? toRecord(s) : null };
    Object.assign(s, { status: "failed", failure_code: input.failureCode, failure_message: input.failureMessage });
    return { ok: true, session: toRecord(s) };
  },
  cancelSession: async (input: { sessionId: string; accountId: string }) => {
    const s = find(input.sessionId);
    if (!s || s.account_id !== input.accountId) return { ok: false, reason: "not_found" };
    if (PRE_EXEC.includes(s.status)) {
      Object.assign(s, { status: "cancelled", cancelled_at: new Date().toISOString() });
      return { ok: true, session: toRecord(s), alreadyCancelled: false };
    }
    if (s.status === "cancelled" || s.status === "expired") return { ok: true, session: toRecord(s), alreadyCancelled: true };
    return { ok: false, reason: "execution_already_started", current: toRecord(s) };
  },
  expireSessionIfDue: async (id: string) => {
    const s = find(id);
    if (!s || !PRE_EXEC.includes(s.status) || Date.parse(s.expires_at) > Date.now()) return null;
    s.status = "expired";
    return toRecord(s);
  },
  expireEligibleSessions: async () => 0,
}));

// ── external boundaries ──────────────────────────────────────────────────────
const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));
const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));
const mockIsFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...a: unknown[]) => mockIsFrozen(...a),
}));
const mockBillingMode = jest.fn();
const mockGetUsage = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getBillingModeServiceRole: (...a: unknown[]) => mockBillingMode(...a),
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
}));
const mockGetActiveIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActiveIntegration(...a),
}));

import {
  prepareLiveTestSession,
  startLiveTestListening,
  getLiveTestSessionStatus,
  cancelLiveTestSession,
} from "@/services/workflows/liveTest/sessionService";
import { attemptLiveTestCapture } from "@/services/workflows/liveTest/captureService";
import { authorizeLiveTestExecution } from "@/services/workflows/liveTest/authorizeService";
import { advanceLiveTestSession } from "@/services/workflows/liveTest/orchestrationService";
import {
  registerLiveTriggerCaptureAdapter,
  resetLiveTriggerCaptureRegistryForTests,
} from "@/services/triggers/liveCapture/registry";
import type {
  CaptureAttemptResult,
  LiveCaptureContext,
  TriggerBaseline,
} from "@/services/triggers/liveCapture/types";

// ── fixtures ─────────────────────────────────────────────────────────────────
const WF_ID = "wf-1";
const ACCT = "acct-1";
const USER = "user-1";

/** A READY gmail-triggered workflow (real metas; send has recipient + body). */
const definition = () => ({
  nodes: [
    { id: "trigger", kind: "trigger", provider: "gmail", type: "new_email", position: { x: 0, y: 0 }, config: { subject: "ChainReact Google Review", subjectExactMatch: false } },
    { id: "a1", kind: "action", provider: "gmail", type: "send_email", position: { x: 0, y: 1 }, config: { to: ["someone"], subject: "s", textBody: "b" } },
  ],
  edges: [{ id: "e1", from: "trigger", to: "a1" }],
});

const workflowFixture = () => ({
  id: WF_ID, accountId: ACCT, createdByUserId: USER, name: "Live test target",
  state: "draft", draftDefinition: definition(),
});

const CANONICAL_EVENT = {
  provider: "gmail", eventType: "new_email", eventId: "msg-1",
  occurredAt: "2026-08-01T10:00:00.000Z", providerAccountId: "acct-gmail",
  payload: { id: "msg-1", subject: "ChainReact Google Review" },
};
const PREVIEW = { sender: "Sender", subject: "ChainReact Google Review", receivedAt: "2026-08-01T10:00:00.000Z" };

/** Programmable synthetic adapter. */
const adapterState: {
  baselineFails: boolean;
  results: CaptureAttemptResult[];
  onCaptureNext?: () => Promise<void> | void;
  contexts: LiveCaptureContext[];
} = { baselineFails: false, results: [], contexts: [] };

function registerSyntheticAdapter(): void {
  registerLiveTriggerCaptureAdapter({
    providerId: "gmail",
    eventType: "new_email",
    async establishBaseline(): Promise<TriggerBaseline> {
      if (adapterState.baselineFails) throw new Error("provider unavailable");
      return { listeningFrom: "2026-08-01T09:59:00.000Z", seenIds: [] };
    },
    async captureNext(context): Promise<CaptureAttemptResult> {
      adapterState.contexts.push(context);
      await adapterState.onCaptureNext?.();
      return adapterState.results.shift() ?? { status: "waiting" };
    },
  });
}

async function prepared() {
  const p = await prepareLiveTestSession({ workflowId: WF_ID, userId: USER });
  if (!p.ok) throw new Error(`prepare failed: ${p.reason}`);
  return p;
}
async function listening() {
  const p = await prepared();
  const s = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce });
  if (!s.ok) throw new Error(`start failed: ${s.reason}`);
  return { ...p, session: s.status };
}

beforeEach(() => {
  mem.sessions = []; mem.runs = []; mem.seq = 0;
  adapterState.baselineFails = false; adapterState.results = []; adapterState.contexts = [];
  adapterState.onCaptureNext = undefined;
  resetLiveTriggerCaptureRegistryForTests();
  registerSyntheticAdapter();
  mockGetWorkflow.mockReset().mockResolvedValue(workflowFixture());
  mockRequireRole.mockReset().mockResolvedValue({ ok: true, role: "owner" });
  mockIsFrozen.mockReset().mockResolvedValue(false);
  mockBillingMode.mockReset().mockResolvedValue("standard");
  mockGetUsage.mockReset().mockResolvedValue({ tasksUsed: 3, tasksLimit: 100 });
  mockGetActiveIntegration.mockReset().mockResolvedValue({ id: "int-gmail-1" });
});

// ── §17 completion criterion ─────────────────────────────────────────────────
describe("live-test flow — the complete backend path with a synthetic adapter", () => {
  it("prepare → disclosure → start → waiting → captured → atomic authorization → ONE queued run", async () => {
    const p = await prepared();
    expect(p.reused).toBe(false);
    expect(p.disclosure.effects.map((e) => e.kind)).toEqual(["reads", "sends"]);
    expect(p.trigger).toEqual({ nodeId: "trigger", provider: "gmail", eventType: "new_email" });
    // Preparing performed NO provider work and consumed nothing.
    expect(adapterState.contexts).toHaveLength(0);
    expect(mem.runs).toHaveLength(0);

    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce });
    expect(started).toMatchObject({ ok: true, alreadyListening: false });
    expect(find(p.sessionId)!.capture_baseline).toEqual({ listeningFrom: "2026-08-01T09:59:00.000Z", seenIds: [] });

    // First poll: nothing yet — session unchanged.
    adapterState.results = [{ status: "waiting" }];
    expect(await attemptLiveTestCapture({ sessionId: p.sessionId })).toEqual({ ok: true, captured: false });
    expect(find(p.sessionId)!.status).toBe("waiting_for_trigger");

    // Second poll: the matching event.
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    const captured = await attemptLiveTestCapture({ sessionId: p.sessionId });
    expect(captured).toMatchObject({ ok: true, captured: true });
    expect(find(p.sessionId)!.status).toBe("trigger_received");
    expect(find(p.sessionId)!.captured_event).toEqual(CANONICAL_EVENT);

    const authorized = await authorizeLiveTestExecution({ sessionId: p.sessionId });
    expect(authorized).toMatchObject({ ok: true, alreadyAuthorized: false });
    expect(mem.runs).toHaveLength(1);
    const s = find(p.sessionId)!;
    expect(s.status).toBe("running");
    expect(s.consumed_at).not.toBeNull();
    expect(s.workflow_run_id).toBe(mem.runs[0]!.id);
  });

  it("duplicate/concurrent authorization converges on the SAME single run", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    await attemptLiveTestCapture({ sessionId });

    const [r1, r2] = await Promise.all([
      authorizeLiveTestExecution({ sessionId }),
      authorizeLiveTestExecution({ sessionId }),
    ]);
    const r3 = await authorizeLiveTestExecution({ sessionId });
    for (const r of [r1, r2, r3]) expect(r.ok).toBe(true);
    const runIds = new Set([r1, r2, r3].map((r) => (r as { runId: string }).runId));
    expect(runIds.size).toBe(1);
    expect(mem.runs).toHaveLength(1);
  });

  it("the safe status DTO never carries the nonce, raw payload, or baseline", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    await attemptLiveTestCapture({ sessionId });
    const status = await getLiveTestSessionStatus({ sessionId, workflowId: WF_ID, userId: USER });
    if (!status.ok) throw new Error("status failed");
    const blob = JSON.stringify(status.status);
    expect(status.status.triggerPreview).toEqual(PREVIEW);
    expect(blob).not.toContain(find(sessionId)!.nonce);
    expect(blob).not.toContain("providerAccountId");
    expect(blob).not.toContain("listeningFrom");
    expect(blob).not.toContain("payload");
  });
});

// ── consent + staleness ──────────────────────────────────────────────────────
describe("live-test flow — consent binding", () => {
  it("prepare is idempotent while unchanged (same session reused)", async () => {
    const p1 = await prepared();
    const p2 = await prepared();
    expect(p2.reused).toBe(true);
    expect(p2.sessionId).toBe(p1.sessionId);
    expect(mem.sessions).toHaveLength(1);
  });

  it("a workflow EDIT between prepare and start rejects the stale session (typed)", async () => {
    const p = await prepared();
    const edited = workflowFixture();
    (edited.draftDefinition.nodes[1]!.config as Record<string, unknown>).textBody = "changed body";
    mockGetWorkflow.mockResolvedValue(edited);
    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce });
    expect(started).toEqual({ ok: false, reason: "stale_definition" });
    expect(find(p.sessionId)!.status).toBe("failed");
    expect(find(p.sessionId)!.failure_code).toBe("stale_definition");
  });

  it("a CONNECTION change between prepare and start rejects the stale session (typed)", async () => {
    const p = await prepared();
    mockGetActiveIntegration.mockResolvedValue({ id: "int-gmail-DIFFERENT" });
    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce });
    expect(started).toEqual({ ok: false, reason: "stale_connections" });
    expect(find(p.sessionId)!.failure_code).toBe("stale_connections");
  });

  it("a workflow edit AFTER capture rejects authorization (typed)", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    await attemptLiveTestCapture({ sessionId });
    const edited = workflowFixture();
    (edited.draftDefinition.nodes[1]!.config as Record<string, unknown>).to = ["someone-else"];
    mockGetWorkflow.mockResolvedValue(edited);
    expect(await authorizeLiveTestExecution({ sessionId })).toEqual({ ok: false, reason: "stale_definition" });
    expect(mem.runs).toHaveLength(0);
    expect(find(sessionId)!.status).toBe("failed");
  });

  it("a wrong nonce is rejected and starts nothing", async () => {
    const p = await prepared();
    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: "not-the-nonce" });
    expect(started).toEqual({ ok: false, reason: "invalid_nonce" });
    expect(find(p.sessionId)!.status).toBe("awaiting_consent");
  });

  it("only the preparing user may start — another member is refused", async () => {
    const p = await prepared();
    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: "user-2", nonce: p.nonce });
    expect(started).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("a non-member cannot even see the session (404-shaped, no existence leak)", async () => {
    const p = await prepared();
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    expect(await getLiveTestSessionStatus({ sessionId: p.sessionId, workflowId: WF_ID, userId: "outsider" })).toEqual({ ok: false, reason: "session_not_found" });
    expect(await cancelLiveTestSession({ sessionId: p.sessionId, workflowId: WF_ID, userId: "outsider" })).toEqual({ ok: false, reason: "session_not_found" });
  });

  it("an incomplete workflow is refused at prepare with the actionable readiness shape — and no session exists", async () => {
    const broken = workflowFixture();
    // Remove the send body → the requiredAnyOf group blocks readiness.
    (broken.draftDefinition.nodes[1]!.config as Record<string, unknown>) = { to: ["someone"], subject: "s" };
    mockGetWorkflow.mockResolvedValue(broken);
    const p = await prepareLiveTestSession({ workflowId: WF_ID, userId: USER });
    expect(p.ok).toBe(false);
    if (p.ok || p.reason !== "not_ready") throw new Error("expected not_ready");
    expect(JSON.stringify(p.readiness)).toContain("text body or HTML body");
    expect(mem.sessions).toHaveLength(0);
  });

  it("baseline failure leaves the session awaiting consent and is retryable", async () => {
    const p = await prepared();
    adapterState.baselineFails = true;
    const started = await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce });
    expect(started).toEqual({ ok: false, reason: "baseline_failed", retryable: true });
    expect(find(p.sessionId)!.status).toBe("awaiting_consent");
    expect(find(p.sessionId)!.consented_at).toBeNull();
    // Retry after recovery succeeds.
    adapterState.baselineFails = false;
    expect((await startLiveTestListening({ sessionId: p.sessionId, workflowId: WF_ID, userId: USER, nonce: p.nonce })).ok).toBe(true);
  });

  it("duplicate start is idempotent (already listening, no second baseline)", async () => {
    const { sessionId, nonce } = await listening();
    const again = await startLiveTestListening({ sessionId, workflowId: WF_ID, userId: USER, nonce });
    expect(again).toMatchObject({ ok: true, alreadyListening: true });
  });
});

// ── cancellation / expiry defeat delayed work ────────────────────────────────
describe("live-test flow — cancellation and expiry race-safety", () => {
  it("cancellation while a capture is IN FLIGHT drops the late result — no capture, no run", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    adapterState.onCaptureNext = async () => {
      // The user cancels while the adapter is mid-poll.
      await cancelLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    };
    const outcome = await attemptLiveTestCapture({ sessionId });
    expect(outcome).toMatchObject({ ok: false, reason: "not_listening", status: "cancelled" });
    expect(find(sessionId)!.captured_event).toBeNull();
    expect(await authorizeLiveTestExecution({ sessionId })).toEqual({ ok: false, reason: "cancelled" });
    expect(mem.runs).toHaveLength(0);
  });

  it("expiry while a capture is IN FLIGHT drops the late result", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    adapterState.onCaptureNext = () => {
      find(sessionId)!.expires_at = new Date(Date.now() - 1000).toISOString();
    };
    const outcome = await attemptLiveTestCapture({ sessionId });
    expect(outcome).toMatchObject({ ok: false, reason: "not_listening" });
    expect(find(sessionId)!.captured_event).toBeNull();
    expect(mem.runs).toHaveLength(0);
  });

  it("an expired listening session refuses capture up-front and reads as expired", async () => {
    const { sessionId } = await listening();
    find(sessionId)!.expires_at = new Date(Date.now() - 1000).toISOString();
    const outcome = await attemptLiveTestCapture({ sessionId });
    expect(outcome).toMatchObject({ ok: false, reason: "not_listening", status: "expired" });
    const status = await getLiveTestSessionStatus({ sessionId, workflowId: WF_ID, userId: USER });
    if (!status.ok) throw new Error("status failed");
    expect(status.status.status).toBe("expired");
    expect(status.status.canCancel).toBe(false);
  });

  it("cancel is idempotent, and refuses (typed) once execution began — never claiming rollback", async () => {
    const { sessionId } = await listening();
    const c1 = await cancelLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(c1).toMatchObject({ ok: true, alreadyCancelled: false });
    const c2 = await cancelLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(c2).toMatchObject({ ok: true, alreadyCancelled: true });

    // A consumed/running session cannot be cancelled.
    mem.sessions = []; mem.runs = [];
    const again = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    await attemptLiveTestCapture({ sessionId: again.sessionId });
    await authorizeLiveTestExecution({ sessionId: again.sessionId });
    const c3 = await cancelLiveTestSession({ sessionId: again.sessionId, workflowId: WF_ID, userId: USER });
    expect(c3).toMatchObject({ ok: false, reason: "execution_already_started" });
  });

  it("a duplicate captured event cannot transition twice", async () => {
    const { sessionId } = await listening();
    adapterState.results = [
      { status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} },
      { status: "captured", payload: { ...CANONICAL_EVENT, eventId: "msg-2" }, preview: PREVIEW, baseline: {} },
    ];
    await attemptLiveTestCapture({ sessionId });
    const second = await attemptLiveTestCapture({ sessionId });
    expect(second).toMatchObject({ ok: false, reason: "not_listening", status: "trigger_received" });
    expect((find(sessionId)!.captured_event as { eventId: string }).eventId).toBe("msg-1");
  });
});

// ── payload validation + usage limits ────────────────────────────────────────
describe("live-test flow — payload contract and usage", () => {
  it("a malformed adapter payload is rejected (canonical TriggerEvent contract)", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{
      status: "captured",
      payload: { provider: "gmail", eventType: "new_email" } as never, // missing required fields
      preview: PREVIEW, baseline: {},
    }];
    expect(await attemptLiveTestCapture({ sessionId })).toEqual({ ok: false, reason: "invalid_payload" });
    expect(find(sessionId)!.status).toBe("waiting_for_trigger");
  });

  it("an adapter emitting a DIFFERENT trigger identity is rejected", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{
      status: "captured",
      payload: { ...CANONICAL_EVENT, provider: "slack", eventType: "message" },
      preview: PREVIEW, baseline: {},
    }];
    expect(await attemptLiveTestCapture({ sessionId })).toEqual({ ok: false, reason: "adapter_mismatch" });
  });

  it("a reached task limit refuses authorization WITHOUT consuming the session (retryable)", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    await attemptLiveTestCapture({ sessionId });
    mockGetUsage.mockResolvedValue({ tasksUsed: 100, tasksLimit: 100 });
    expect(await authorizeLiveTestExecution({ sessionId })).toEqual({ ok: false, reason: "usage_limit_reached" });
    expect(mem.runs).toHaveLength(0);
    expect(find(sessionId)!.status).toBe("trigger_received"); // recoverable, not consumed
    // Upgrade → the SAME captured event authorizes.
    mockGetUsage.mockResolvedValue({ tasksUsed: 100, tasksLimit: 1000 });
    expect((await authorizeLiveTestExecution({ sessionId })).ok).toBe(true);
    expect(mem.runs).toHaveLength(1);
  });

  it("prepare / start / waiting / cancel never create a run (usage begins only at execution)", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "waiting" }];
    await attemptLiveTestCapture({ sessionId });
    await cancelLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(mem.runs).toHaveLength(0);
  });

  it("an unsupported trigger is a typed refusal at prepare", async () => {
    resetLiveTriggerCaptureRegistryForTests(); // nothing registered
    const p = await prepareLiveTestSession({ workflowId: WF_ID, userId: USER });
    expect(p).toEqual({
      ok: false, reason: "trigger_capture_unsupported", provider: "gmail", eventType: "new_email",
    });
  });
});

// ── WORKFLOW-LIVE-TEST-4 §2 — the status-poll advancement loop ───────────────
describe("live-test flow — status-poll advancement (serverless capture loop)", () => {
  it("each poll advances one bounded step: waiting → captured+authorized in ONE tick → converges on the same run", async () => {
    const { sessionId } = await listening();

    // Tick 1: nothing matched — honest waiting, nothing created.
    adapterState.results = [{ status: "waiting" }];
    const t1 = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(t1).toMatchObject({
      ok: true,
      advisory: null,
      queuedRunId: null,
      status: { status: "waiting_for_trigger" },
    });
    expect(mem.runs).toHaveLength(0);

    // Tick 2: the event arrives — capture AND authorization happen in the same tick, so the
    // user's poll comes back already `running` with the canonical run id.
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    const t2 = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    if (!t2.ok) throw new Error("advance failed");
    expect(t2.status.status).toBe("running");
    expect(t2.queuedRunId).toBe(mem.runs[0]!.id);
    expect(mem.runs).toHaveLength(1);

    // Tick 3 (another tab / a slow duplicate poll): no second run, same run id handed back so
    // a lost drain kick can be retried.
    const t3 = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    if (!t3.ok) throw new Error("advance failed");
    expect(t3.queuedRunId).toBe(t2.queuedRunId);
    expect(mem.runs).toHaveLength(1);
  });

  it("an adapter throw keeps the session listening and reports only a typed transient advisory", async () => {
    const { sessionId } = await listening();
    adapterState.onCaptureNext = () => {
      throw new Error("gmail 503: internal token dump — must never surface");
    };
    const t = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(t).toMatchObject({ ok: true, advisory: "capture_error", queuedRunId: null });
    if (!t.ok) throw new Error("unreachable");
    expect(t.status.status).toBe("waiting_for_trigger");
    // The advisory is a closed enum value — the provider error text never rides along.
    expect(JSON.stringify(t)).not.toContain("token dump");
  });

  it("a reached task limit is an advisory; the captured event stays recoverable and later runs", async () => {
    const { sessionId } = await listening();
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    mockGetUsage.mockResolvedValue({ tasksUsed: 100, tasksLimit: 100 });
    const blocked = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    expect(blocked).toMatchObject({ ok: true, advisory: "usage_limit_reached", queuedRunId: null });
    expect(find(sessionId)!.status).toBe("trigger_received");
    expect(mem.runs).toHaveLength(0);

    // Upgrade → the NEXT poll authorizes the SAME captured event, no re-capture.
    mockGetUsage.mockResolvedValue({ tasksUsed: 100, tasksLimit: 1000 });
    const t = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    if (!t.ok) throw new Error("advance failed");
    expect(t.status.status).toBe("running");
    expect(mem.runs).toHaveLength(1);
    expect(adapterState.contexts).toHaveLength(1); // captured once, never twice
  });

  it("a non-member poll collapses to session_not_found and advances nothing", async () => {
    const { sessionId } = await listening();
    mockRequireRole.mockResolvedValue({ ok: false });
    adapterState.results = [{ status: "captured", payload: CANONICAL_EVENT, preview: PREVIEW, baseline: {} }];
    expect(await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER })).toEqual({
      ok: false,
      reason: "session_not_found",
    });
    expect(find(sessionId)!.status).toBe("waiting_for_trigger");
    expect(adapterState.contexts).toHaveLength(0); // no provider call for a refused caller
  });

  it("a lapsed listening window expires on poll without touching the provider", async () => {
    const { sessionId } = await listening();
    find(sessionId)!.expires_at = new Date(Date.now() - 1000).toISOString();
    const t = await advanceLiveTestSession({ sessionId, workflowId: WF_ID, userId: USER });
    if (!t.ok) throw new Error("advance failed");
    expect(t.status.status).toBe("expired");
    expect(adapterState.contexts).toHaveLength(0);
    expect(mem.runs).toHaveLength(0);
  });
});
