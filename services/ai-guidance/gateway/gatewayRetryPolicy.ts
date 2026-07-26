/**
 * Bounded retry policy for the Hermes Agent gateway (REACT-AGENT-RETRY-BACKOFF-1).
 *
 * PURE decision logic — no fetch, no timers, no env, no clock of its own. The client
 * (`hermesAgentGatewayClient`) owns the I/O and asks this module two questions: "is this failure
 * worth one more attempt?" and "how long should I wait first?".
 *
 * The policy is deliberately NARROW. Before this slice the guidance path made exactly ONE Hermes
 * attempt with no retry of any kind, and the failure it actually produced in production was a
 * TIMEOUT — which must NEVER be retried: the first attempt already consumed most of the request
 * budget, so a second one cannot finish and would only convert a typed 503 into a bodyless platform
 * 504. Retry exists here for the opposite shape of failure: the connection that dies in the first
 * second. Anything slow, anything deterministic, and anything the user cancelled is answered, not
 * retried.
 *
 * Hard bounds (see `MAX_TOTAL_ATTEMPTS`): 1 initial attempt + at most 1 automatic retry. There is no
 * loop that can grow, no exponential ladder, and no second provider/model — a failure that survives
 * two attempts is returned to the user, who retries manually if they want to.
 */

import type { GuidanceRetryReason, GuidanceRetrySkipReason } from "@/contracts/aiGuidance";

/** 1 initial attempt + 1 automatic retry. Never unbounded. */
export const MAX_TOTAL_ATTEMPTS = 2 as const;

/** Randomized backoff window before the single allowed retry (small — this is a sync route). */
export const BACKOFF_MIN_MS = 250 as const;
export const BACKOFF_MAX_MS = 750 as const;

/**
 * A retryable failure must also be an IMMEDIATE one. A connection reset at 0.4s is transient; the
 * same reset at 40s means the brain was already working and a second attempt cannot finish inside
 * the budget. This is the "fast, transient failures only" rule in code.
 */
export const IMMEDIATE_FAILURE_MAX_MS = 5_000 as const;

/**
 * Minimum time that must remain (AFTER the backoff) for a second attempt to be worth starting. A
 * real Hermes turn takes seconds; starting one with 2s left burns the remainder and still fails.
 */
export const MIN_SECOND_ATTEMPT_MS = 10_000 as const;

/** A provider `Retry-After` longer than this is a real cooldown, not a blip — do not wait it out. */
export const MAX_HONORED_RETRY_AFTER_MS = 2_000 as const;

/**
 * The reason enums are declared in `contracts/aiGuidance` (they are logged, audited, and read by the
 * route, which may not import this server-only module) and re-exported here for the client's use.
 */
export type GatewayRetryReason = GuidanceRetryReason;
export type GatewayRetrySkipReason = GuidanceRetrySkipReason;

/**
 * What one attempt did. The client maps its transport/HTTP result onto this; the policy never sees a
 * raw error, a provider body, or a response object.
 */
export type GatewayAttemptFailure =
  /** Socket/DNS/connection-reset class — `fetch` rejected without an HTTP response. */
  | { readonly kind: "network_error" }
  /** A real HTTP response arrived with a non-2xx status. */
  | { readonly kind: "http_error"; readonly status: number; readonly retryAfterMs: number | null }
  /** OUR deadline fired (the abort was ours). Never retryable. */
  | { readonly kind: "timeout" }
  /** The caller/browser aborted. Never retryable. */
  | { readonly kind: "cancelled" }
  /** 2xx with an unusable body, or an envelope-level provider error. Deterministic — never retryable. */
  | { readonly kind: "invalid_response" };

export interface RetryDecisionInput {
  readonly failure: GatewayAttemptFailure;
  /** Attempts already completed (1 after the initial attempt). */
  readonly attemptsMade: number;
  /** How long the failing attempt took. Gates the "immediate failure" rule. */
  readonly attemptElapsedMs: number;
  /** Time left in the whole logical request's budget, measured now. */
  readonly remainingBudgetMs: number;
  /** The backoff the client intends to wait (already jittered) — counted against the budget. */
  readonly plannedBackoffMs: number;
}

export type RetryDecision =
  | { readonly retry: true; readonly reason: GatewayRetryReason }
  | { readonly retry: false; readonly skipReason: GatewayRetrySkipReason };

/** Map a failure onto its retry reason, or null when the failure class is never retryable. */
function retryReasonFor(failure: GatewayAttemptFailure): GatewayRetryReason | null {
  switch (failure.kind) {
    case "network_error":
      return "network_error";
    case "http_error":
      // ONLY the two "the front door is momentarily shut" statuses, plus a short-cooldown 429.
      // 500 is deliberately absent: it usually means the request itself broke something downstream,
      // so repeating it repeats the break. 401/403/404/4xx are deterministic — see below.
      if (failure.status === 502) return "status_502";
      if (failure.status === 503) return "status_503";
      if (failure.status === 429) return "status_429";
      return null;
    case "timeout":
    case "cancelled":
    case "invalid_response":
      return null;
  }
}

/**
 * The single decision point. Order matters: the never-retryable classes are rejected with their OWN
 * skip reason first, so production logs say WHY a retry did not happen (`timeout` and
 * `insufficient_budget` are very different operational signals) rather than a flat "no".
 */
export function decideRetry(input: RetryDecisionInput): RetryDecision {
  const { failure, attemptsMade, attemptElapsedMs, remainingBudgetMs, plannedBackoffMs } = input;

  if (failure.kind === "timeout") return { retry: false, skipReason: "timeout" };
  if (failure.kind === "cancelled") return { retry: false, skipReason: "cancelled" };
  if (attemptsMade >= MAX_TOTAL_ATTEMPTS) return { retry: false, skipReason: "attempts_exhausted" };

  const reason = retryReasonFor(failure);
  if (!reason) return { retry: false, skipReason: "not_retryable" };

  // A 429 is only honored when the provider itself says the cooldown is short.
  if (failure.kind === "http_error" && failure.status === 429) {
    if (failure.retryAfterMs === null || failure.retryAfterMs > MAX_HONORED_RETRY_AFTER_MS) {
      return { retry: false, skipReason: "retry_after_too_long" };
    }
  }

  // Fast failures only — a transient class that took a long time is not actually transient.
  if (attemptElapsedMs > IMMEDIATE_FAILURE_MAX_MS) return { retry: false, skipReason: "slow_failure" };

  // The retry must fit, WITH its backoff, inside what is left of the request budget.
  if (remainingBudgetMs - plannedBackoffMs < MIN_SECOND_ATTEMPT_MS) {
    return { retry: false, skipReason: "insufficient_budget" };
  }

  return { retry: true, reason };
}

/**
 * Jittered backoff in [BACKOFF_MIN_MS, BACKOFF_MAX_MS]. Jitter matters even at two attempts: without
 * it, every client that saw the same gateway blip returns in lockstep and re-creates the spike.
 * `random` is injected so tests are deterministic and never sleep for real.
 */
export function computeBackoffMs(random: () => number = Math.random): number {
  const span = BACKOFF_MAX_MS - BACKOFF_MIN_MS;
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(BACKOFF_MIN_MS + r * span);
}

/**
 * Parse a `Retry-After` header into ms. Supports the delay-seconds form only; the HTTP-date form is
 * treated as absent because honoring it needs a trusted clock comparison against the server's date,
 * and any date far enough out to matter would exceed `MAX_HONORED_RETRY_AFTER_MS` anyway.
 */
export function parseRetryAfterMs(headerValue: string | null | undefined): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1_000);
}
