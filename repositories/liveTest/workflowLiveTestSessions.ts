import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  PRE_EXECUTION_LIVE_TEST_STATUSES,
  ACTIVE_LIVE_TEST_STATUSES,
  canTransition,
  type LiveTestFailureCode,
  type LiveTestSessionStatus,
} from "@/core/workflows/liveTest/liveTestSessionLifecycle";

/**
 * Repository for `workflow_live_test_sessions` (WORKFLOW-LIVE-TEST-3 §1).
 *
 * A live-test session is a server-minted, expiring, SINGLE-USE authorization for one consented
 * real execution of an inactive workflow. Everything here is service-role: the table has
 * deny-all RLS and no anon/authenticated grant (20260811000000/1), so a browser can neither
 * read nor mint a session — the routes go through the services, the services through here.
 *
 * Concurrency model, in order of authority:
 *   1. The DATABASE is final. Every transition is a GUARDED UPDATE whose WHERE names the
 *      expected current status (compare-and-set); the one-active partial unique index caps a
 *      workflow at one live session; `authorize_live_test_run` does claim + run-insert +
 *      consume in one transaction.
 *   2. The lifecycle table (`core/workflows/liveTestSessionLifecycle`) is consulted BEFORE
 *      issuing SQL — an illegal transition is rejected in-process without a round-trip — and the
 *      guarded IN-lists are BUILT FROM its exported sets, so repo and lifecycle cannot drift.
 *
 * NO-LEAK: records stay server-side. `nonce` and `capturedEvent` are internal fields — the
 * status service projects a safe DTO and never returns them to a client.
 */

interface SessionRow {
  id: string;
  account_id: string;
  user_id: string;
  workflow_id: string;
  definition_hash: string;
  trigger_node_id: string;
  trigger_provider: string;
  trigger_event_type: string;
  connection_ids: string[];
  status: LiveTestSessionStatus;
  capture_baseline: Record<string, unknown> | null;
  captured_event: TriggerEvent | null;
  trigger_preview: Record<string, unknown> | null;
  nonce: string;
  expires_at: string;
  consented_at: string | null;
  trigger_captured_at: string | null;
  execution_authorized_at: string | null;
  cancelled_at: string | null;
  consumed_at: string | null;
  workflow_run_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveTestSessionRecord {
  id: string;
  accountId: string;
  userId: string;
  workflowId: string;
  definitionHash: string;
  triggerNodeId: string;
  triggerProvider: string;
  triggerEventType: string;
  connectionIds: readonly string[];
  status: LiveTestSessionStatus;
  captureBaseline: Readonly<Record<string, unknown>> | null;
  /** INTERNAL — the canonical captured TriggerEvent. Never surfaced to a client. */
  capturedEvent: TriggerEvent | null;
  /** SAFE preview (sender / subject / received time). The only capture data a client may see. */
  triggerPreview: Readonly<Record<string, unknown>> | null;
  /** INTERNAL — server-issued action secret. Never included in the status DTO. */
  nonce: string;
  expiresAt: string;
  consentedAt: string | null;
  triggerCapturedAt: string | null;
  executionAuthorizedAt: string | null;
  cancelledAt: string | null;
  consumedAt: string | null;
  workflowRunId: string | null;
  failureCode: LiveTestFailureCode | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS =
  "id, account_id, user_id, workflow_id, definition_hash, trigger_node_id, trigger_provider, trigger_event_type, connection_ids, status, capture_baseline, captured_event, trigger_preview, nonce, expires_at, consented_at, trigger_captured_at, execution_authorized_at, cancelled_at, consumed_at, workflow_run_id, failure_code, failure_message, created_at, updated_at";

function rowToRecord(row: SessionRow): LiveTestSessionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    definitionHash: row.definition_hash,
    triggerNodeId: row.trigger_node_id,
    triggerProvider: row.trigger_provider,
    triggerEventType: row.trigger_event_type,
    connectionIds: row.connection_ids ?? [],
    status: row.status,
    captureBaseline: row.capture_baseline,
    capturedEvent: row.captured_event,
    triggerPreview: row.trigger_preview,
    nonce: row.nonce,
    expiresAt: row.expires_at,
    consentedAt: row.consented_at,
    triggerCapturedAt: row.trigger_captured_at,
    executionAuthorizedAt: row.execution_authorized_at,
    cancelledAt: row.cancelled_at,
    consumedAt: row.consumed_at,
    workflowRunId: row.workflow_run_id,
    failureCode: (row.failure_code as LiveTestFailureCode | null) ?? null,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── create ───────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  accountId: string;
  userId: string;
  workflowId: string;
  definitionHash: string;
  triggerNodeId: string;
  triggerProvider: string;
  triggerEventType: string;
  connectionIds: readonly string[];
  /** Server-issued unpredictable value (crypto.randomUUID or better). Never client-supplied. */
  nonce: string;
  expiresAt: string;
}

export type CreateSessionResult =
  | { ok: true; session: LiveTestSessionRecord }
  /** The one-active partial unique index refused a second live session for this workflow. */
  | { ok: false; reason: "active_session_exists" };

export async function createAwaitingConsentSession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: create (workflow ${input.workflowId})`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .insert({
      account_id: input.accountId,
      user_id: input.userId,
      workflow_id: input.workflowId,
      definition_hash: input.definitionHash,
      trigger_node_id: input.triggerNodeId,
      trigger_provider: input.triggerProvider,
      trigger_event_type: input.triggerEventType,
      connection_ids: [...input.connectionIds],
      nonce: input.nonce,
      expires_at: input.expiresAt,
      status: "awaiting_consent",
    })
    .select(COLUMNS)
    .single<SessionRow>();
  if (error) {
    // 23505 on the one-active partial unique index — a live session already occupies the slot.
    if (error.code === "23505") return { ok: false, reason: "active_session_exists" };
    throw new Error(`workflow_live_test_sessions.create failed: ${error.message}`);
  }
  return { ok: true, session: rowToRecord(data) };
}

// ── reads ────────────────────────────────────────────────────────────────────

export async function getSessionById(
  sessionId: string,
): Promise<LiveTestSessionRecord | null> {
  const supabase = getServiceRoleClient(`workflow_live_test_sessions: getById ${sessionId}`);
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .select(COLUMNS)
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.getById failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/** The workflow's current live session (one exists at most — the partial unique index). */
export async function getActiveSessionForWorkflow(
  workflowId: string,
): Promise<LiveTestSessionRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: getActive (workflow ${workflowId})`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .select(COLUMNS)
    .eq("workflow_id", workflowId)
    .in("status", [...ACTIVE_LIVE_TEST_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.getActive failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * The CONSUMED session that authorized a given run — the queue processor's capability lookup.
 * Only a consumed row can name a run (DB CHECK), so a hit here proves the run passed the atomic
 * single-use gate.
 */
export async function getConsumedSessionByRunId(
  runId: string,
): Promise<LiveTestSessionRecord | null> {
  const supabase = getServiceRoleClient(`workflow_live_test_sessions: byRun ${runId}`);
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .select(COLUMNS)
    .eq("workflow_run_id", runId)
    .not("consumed_at", "is", null)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.byRun failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * Which of these run ids were authorized by a CONSUMED live-test session — the runs surfaces'
 * batch labeling lookup (WORKFLOW-LIVE-TEST-4). Returns ids only; no session content leaves
 * this function, so the display layer learns "live test: yes/no" and nothing else.
 */
export async function listConsumedRunIds(
  runIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (runIds.length === 0) return new Set();
  const supabase = getServiceRoleClient("workflow_live_test_sessions: consumed run ids");
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .select("workflow_run_id")
    .in("workflow_run_id", [...runIds])
    .not("consumed_at", "is", null);
  if (error) {
    throw new Error(`workflow_live_test_sessions.listConsumedRunIds failed: ${error.message}`);
  }
  return new Set(
    ((data ?? []) as { workflow_run_id: string | null }[])
      .map((r) => r.workflow_run_id)
      .filter((id): id is string => id !== null),
  );
}

// ── guarded transitions ──────────────────────────────────────────────────────

export type TransitionResult =
  | { ok: true; session: LiveTestSessionRecord }
  /** The guard matched nothing — someone else moved the session first. `current` explains. */
  | { ok: false; reason: "conflict"; current: LiveTestSessionRecord | null };

/**
 * awaiting_consent → waiting_for_trigger. The explicit-start action. Guards on the EXACT
 * definition hash the disclosure was generated from, on non-cancellation, and on the TTL — a
 * stale, cancelled or expired session cannot begin listening.
 */
export async function startListening(input: {
  sessionId: string;
  expectedDefinitionHash: string;
  captureBaseline: Readonly<Record<string, unknown>>;
  consentedAt: string;
  /** Listening window end — replaces the awaiting-consent TTL. */
  expiresAt: string;
}): Promise<TransitionResult> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: startListening ${input.sessionId}`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({
      status: "waiting_for_trigger",
      consented_at: input.consentedAt,
      capture_baseline: input.captureBaseline,
      expires_at: input.expiresAt,
    })
    .eq("id", input.sessionId)
    .eq("status", "awaiting_consent")
    .eq("definition_hash", input.expectedDefinitionHash)
    .is("cancelled_at", null)
    .gt("expires_at", new Date().toISOString())
    .select(COLUMNS)
    .maybeSingle<SessionRow>();
  if (error) {
    throw new Error(`workflow_live_test_sessions.startListening failed: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "conflict", current: await getSessionById(input.sessionId) };
  return { ok: true, session: rowToRecord(data) };
}

/**
 * waiting_for_trigger → trigger_received. Persists the canonical captured event durably BEFORE
 * any authorization, plus the safe preview the status endpoint may show. Guarded so a capture
 * landing after cancellation or expiry matches zero rows and dies here.
 */
export async function recordCapturedTrigger(input: {
  sessionId: string;
  capturedEvent: TriggerEvent;
  triggerPreview: Readonly<Record<string, unknown>>;
  capturedAt: string;
}): Promise<TransitionResult> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: recordCapture ${input.sessionId}`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({
      status: "trigger_received",
      trigger_captured_at: input.capturedAt,
      captured_event: input.capturedEvent,
      trigger_preview: input.triggerPreview,
    })
    .eq("id", input.sessionId)
    .eq("status", "waiting_for_trigger")
    .is("cancelled_at", null)
    .gt("expires_at", new Date().toISOString())
    .select(COLUMNS)
    .maybeSingle<SessionRow>();
  if (error) {
    throw new Error(`workflow_live_test_sessions.recordCapture failed: ${error.message}`);
  }
  if (!data) return { ok: false, reason: "conflict", current: await getSessionById(input.sessionId) };
  return { ok: true, session: rowToRecord(data) };
}

// ── atomic execution authorization (the RPC) ─────────────────────────────────

export type AuthorizeExecutionResult =
  /** This call won the claim: exactly one queued run was created in the same transaction. */
  | { ok: true; runId: string; alreadyAuthorized: false }
  /** A previous call won: the SAME run is returned; nothing new was created. */
  | { ok: true; runId: string; alreadyAuthorized: true }
  | {
      ok: false;
      reason:
        | "not_found"
        | "cancelled"
        | "expired"
        | "not_eligible"
        | "missing_captured_event";
    };

/**
 * Claim + canonical queued-run insert + consume, in ONE database transaction
 * (`authorize_live_test_run`, 20260812000000). Concurrent callers converge on one run.
 */
export async function authorizeExecution(input: {
  sessionId: string;
  runId: string;
  enqueuedAt: string;
}): Promise<AuthorizeExecutionResult> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: authorize ${input.sessionId}`,
  );
  const { data, error } = await supabase.rpc("authorize_live_test_run", {
    p_session_id: input.sessionId,
    p_run_id: input.runId,
    p_enqueued_at: input.enqueuedAt,
  });
  if (error) {
    throw new Error(`workflow_live_test_sessions.authorize failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome: string; run_id: string | null }
    | undefined;
  if (!row) throw new Error("workflow_live_test_sessions.authorize returned no outcome row.");
  switch (row.outcome) {
    case "authorized":
      return { ok: true, runId: row.run_id!, alreadyAuthorized: false };
    case "already_authorized":
      return { ok: true, runId: row.run_id!, alreadyAuthorized: true };
    case "not_found":
    case "cancelled":
    case "expired":
    case "not_eligible":
    case "missing_captured_event":
      return { ok: false, reason: row.outcome };
    default:
      throw new Error(`workflow_live_test_sessions.authorize: unknown outcome '${row.outcome}'.`);
  }
}

// ── post-execution completion ────────────────────────────────────────────────

/**
 * running → succeeded / failed, keyed by the RUN the session authorized. Called by the queue
 * processor after the engine returns. Guarded on status='running' so it is idempotent and can
 * never resurrect a terminal session.
 */
export async function completeSessionForRun(input: {
  runId: string;
  succeeded: boolean;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: complete (run ${input.runId})`,
  );
  const { error } = await supabase
    .from("workflow_live_test_sessions")
    .update(
      input.succeeded
        ? { status: "succeeded" }
        : { status: "failed", failure_code: "run_failed" },
    )
    .eq("workflow_run_id", input.runId)
    .eq("status", "running");
  if (error) {
    throw new Error(`workflow_live_test_sessions.complete failed: ${error.message}`);
  }
}

// ── failure / cancellation / expiry ──────────────────────────────────────────

/**
 * Move a session to `failed` with a typed, safe code — e.g. a stale definition detected at
 * start, or a refused authorization. `fromStatuses` narrows the guard; each entry is validated
 * against the lifecycle table first, so an illegal move is rejected before any SQL runs.
 */
export async function failSession(input: {
  sessionId: string;
  failureCode: LiveTestFailureCode;
  failureMessage: string;
  fromStatuses: readonly LiveTestSessionStatus[];
}): Promise<TransitionResult> {
  const legalFrom = input.fromStatuses.filter((s) => canTransition(s, "failed"));
  if (legalFrom.length === 0) {
    return { ok: false, reason: "conflict", current: await getSessionById(input.sessionId) };
  }
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: fail ${input.sessionId}`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({
      status: "failed",
      failure_code: input.failureCode,
      failure_message: input.failureMessage,
    })
    .eq("id", input.sessionId)
    .in("status", legalFrom)
    .select(COLUMNS)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.fail failed: ${error.message}`);
  if (!data) return { ok: false, reason: "conflict", current: await getSessionById(input.sessionId) };
  return { ok: true, session: rowToRecord(data) };
}

export type CancelSessionResult =
  | { ok: true; session: LiveTestSessionRecord; alreadyCancelled: boolean }
  /** Execution already began (or finished) — external side effects may exist; nothing is rolled back. */
  | { ok: false; reason: "execution_already_started"; current: LiveTestSessionRecord }
  | { ok: false; reason: "not_found" };

/**
 * Cancel from any PRE-EXECUTION state (the lifecycle's own list — running and terminal states
 * never match the guard). Idempotent: cancelling an already-cancelled session succeeds without
 * a second write. A session at/after `running` returns a typed conflict; the caller must never
 * suggest side effects were undone.
 */
export async function cancelSession(input: {
  sessionId: string;
  accountId: string;
}): Promise<CancelSessionResult> {
  const supabase = getServiceRoleClient(
    `workflow_live_test_sessions: cancel ${input.sessionId}`,
  );
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("account_id", input.accountId)
    .in("status", [...PRE_EXECUTION_LIVE_TEST_STATUSES])
    .select(COLUMNS)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.cancel failed: ${error.message}`);
  if (data) return { ok: true, session: rowToRecord(data), alreadyCancelled: false };

  const current = await getSessionById(input.sessionId);
  if (!current || current.accountId !== input.accountId) return { ok: false, reason: "not_found" };
  if (current.status === "cancelled") {
    return { ok: true, session: current, alreadyCancelled: true };
  }
  if (current.status === "expired") {
    // Expired is equivalent for the caller: the session is inert and nothing executed.
    return { ok: true, session: current, alreadyCancelled: true };
  }
  return { ok: false, reason: "execution_already_started", current };
}

/**
 * Targeted lazy expiry: move ONE session to `expired` iff it is pre-execution and past its TTL.
 * Called opportunistically by the status/capture services so a session reads honestly without a
 * cron. Guarded exactly like the sweep — a running/consumed session can never match.
 */
export async function expireSessionIfDue(
  sessionId: string,
  nowIso: string,
): Promise<LiveTestSessionRecord | null> {
  const supabase = getServiceRoleClient(`workflow_live_test_sessions: expireIfDue ${sessionId}`);
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({ status: "expired" })
    .eq("id", sessionId)
    .in("status", [...PRE_EXECUTION_LIVE_TEST_STATUSES])
    .lte("expires_at", nowIso)
    .select(COLUMNS)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`workflow_live_test_sessions.expireIfDue failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * Sweep pre-execution sessions past their TTL → expired. Guarded IN-list from the lifecycle
 * table; a consumed/running session is never expired by the sweep.
 */
export async function expireEligibleSessions(nowIso: string): Promise<number> {
  const supabase = getServiceRoleClient("workflow_live_test_sessions: expire sweep");
  const { data, error } = await supabase
    .from("workflow_live_test_sessions")
    .update({ status: "expired" })
    .in("status", [...PRE_EXECUTION_LIVE_TEST_STATUSES])
    .lte("expires_at", nowIso)
    .select("id");
  if (error) throw new Error(`workflow_live_test_sessions.expire failed: ${error.message}`);
  return (data ?? []).length;
}
