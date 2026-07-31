/**
 * WORKFLOW-LIVE-TEST-2 §4 — the live-test session state machine.
 *
 * A live-test session is an EXECUTION AUTHORIZATION: while it is alive it can, exactly once, let
 * one real side-effecting run of an otherwise inactive workflow happen. So its legal transitions
 * are defined in one place, as data, and every mover consults this table — never an ad-hoc
 * `if (status === ...)` at a call site.
 *
 * Fail-closed by construction: `canTransition` answers `false` for any pair not explicitly listed,
 * so a status added to the enum later is unreachable until someone declares where it may come from
 * and go. Terminal states declare no outgoing edges at all, which is what makes
 * `cancelled → running` and `expired → trigger_received` impossible rather than merely unlikely.
 *
 * Pure `core/` module: no repository, no service, no I/O. The DATABASE is the enforcement point
 * (guarded UPDATEs whose WHERE clause names the expected current status, plus the partial unique
 * index that allows only one live session per workflow); this module is the shared vocabulary both
 * the repository and the UI reason with, so they cannot drift.
 */

export const LIVE_TEST_SESSION_STATUSES = [
  "awaiting_consent",
  "waiting_for_trigger",
  "trigger_received",
  "authorizing_execution",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export type LiveTestSessionStatus = (typeof LIVE_TEST_SESSION_STATUSES)[number];

/**
 * Terminal states. A session in one of these can never move again — the run either happened or it
 * definitively did not.
 */
export const TERMINAL_LIVE_TEST_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const satisfies readonly LiveTestSessionStatus[];

/**
 * States in which a session still occupies the "one live session per workflow" slot. Mirrors the
 * partial unique index `workflow_live_test_sessions_one_active_idx` — kept in sync deliberately,
 * and asserted by a test, because a divergence would either let two sessions listen at once or
 * make a workflow permanently un-testable.
 */
export const ACTIVE_LIVE_TEST_STATUSES = [
  "awaiting_consent",
  "waiting_for_trigger",
  "trigger_received",
  "authorizing_execution",
  "running",
] as const satisfies readonly LiveTestSessionStatus[];

/**
 * States from which the user may still walk away with NOTHING having happened externally: no
 * provider call, no run, no usage. Cancellation and expiry are only offered here.
 */
export const PRE_EXECUTION_LIVE_TEST_STATUSES = [
  "awaiting_consent",
  "waiting_for_trigger",
  "trigger_received",
  "authorizing_execution",
] as const satisfies readonly LiveTestSessionStatus[];

const PRE_EXECUTION = new Set<LiveTestSessionStatus>(PRE_EXECUTION_LIVE_TEST_STATUSES);

/**
 * The complete legal transition table. Anything absent is illegal.
 *
 * The forward path is deliberately one-way and single-file:
 *   awaiting_consent → waiting_for_trigger → trigger_received → authorizing_execution → running
 * and only `running` may reach a run outcome. `authorizing_execution` is a distinct state (rather
 * than going straight to `running`) so the atomic single-use consumption has a status of its own to
 * compare-and-set against — two concurrent captures race on that one transition and exactly one
 * wins.
 */
const TRANSITIONS: Readonly<Record<LiveTestSessionStatus, readonly LiveTestSessionStatus[]>> = {
  awaiting_consent: ["waiting_for_trigger", "cancelled", "expired"],
  waiting_for_trigger: ["trigger_received", "cancelled", "expired"],
  trigger_received: ["authorizing_execution", "cancelled", "expired"],
  // Authorization can still fail closed (readiness/limits/ownership re-check) without a run.
  authorizing_execution: ["running", "failed", "cancelled", "expired"],
  // Once real provider work has begun, cancelling is a lie — side effects may already exist.
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function isTerminalLiveTestStatus(status: LiveTestSessionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isActiveLiveTestStatus(status: LiveTestSessionStatus): boolean {
  return (ACTIVE_LIVE_TEST_STATUSES as readonly LiveTestSessionStatus[]).includes(status);
}

/** True iff the session has NOT yet authorized real execution — safe to cancel or expire. */
export function isPreExecutionLiveTestStatus(status: LiveTestSessionStatus): boolean {
  return PRE_EXECUTION.has(status);
}

/** The only question the movers ask. Unlisted pair → false. */
export function canTransition(
  from: LiveTestSessionStatus,
  to: LiveTestSessionStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Every legal next state, for UI affordances and tests. */
export function allowedTransitions(
  from: LiveTestSessionStatus,
): readonly LiveTestSessionStatus[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * Typed, SAFE failure codes a session may record. Kept small and closed so the UI can map each to
 * actionable copy, and so a provider error string can never become the session's public reason.
 */
export const LIVE_TEST_FAILURE_CODES = [
  /** No matching trigger event arrived before the session's TTL. */
  "trigger_timeout",
  /** The saved workflow changed after the user reviewed its side effects. */
  "stale_definition",
  /** The bound connection selection changed after consent. */
  "stale_connections",
  /** Readiness regressed between consent and capture. */
  "not_ready",
  /** A required integration is disconnected or needs re-authentication. */
  "integration_unavailable",
  /** The account's task or AI-credit limit blocks a real run. */
  "usage_limit_reached",
  /** The caller is no longer permitted to run this workflow. */
  "not_authorized",
  /** Canonical execution started and the run itself failed (details live on the run). */
  "run_failed",
  /** Anything the server could not classify — deliberately last, never a provider message. */
  "internal_error",
] as const;

export type LiveTestFailureCode = (typeof LIVE_TEST_FAILURE_CODES)[number];
