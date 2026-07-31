import type { ReadinessError } from "@/core/workflows/executionReadiness";
import type {
  LiveTestFailureCode,
  LiveTestSessionStatus,
} from "@/core/workflows/liveTest/liveTestSessionLifecycle";
import type { LiveTestDisclosure } from "./disclosure";

/**
 * Shared result types for the live-test services (WORKFLOW-LIVE-TEST-3 §5/§7/§8).
 *
 * Every refusal is a TYPED code the routes serialize verbatim — no free-text-only errors, no
 * generic 500s for predictable outcomes. The safe status DTO is the ONLY session projection a
 * client ever receives: it omits `nonce` (the action secret), `capturedEvent` (the raw provider
 * payload), and `captureBaseline` (internal cursor state) by construction — they are not fields
 * of the type, so a future serializer cannot leak them by accident.
 */

/** How long a prepared session waits for explicit consent before it lapses. */
export const AWAITING_CONSENT_TTL_MS = 10 * 60 * 1000;
/** The listening window after Start Live Test — §7's "bounded period". */
export const LISTENING_WINDOW_MS = 5 * 60 * 1000;

export interface LiveTestSessionStatusDto {
  readonly sessionId: string;
  readonly workflowId: string;
  readonly status: LiveTestSessionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consentedAt: string | null;
  readonly triggerCapturedAt: string | null;
  /** Safe capture preview (sender/subject/received time) — never the raw payload. */
  readonly triggerPreview: Readonly<Record<string, string | null>> | null;
  readonly workflowRunId: string | null;
  readonly failureCode: LiveTestFailureCode | null;
  readonly failureMessage: string | null;
  /** True while the session is still pre-execution (the cancel affordance). */
  readonly canCancel: boolean;
}

export type PrepareLiveTestResult =
  | {
      ok: true;
      sessionId: string;
      /** Server-issued action secret the client must echo on Start. Returned ONCE, here. */
      nonce: string;
      expiresAt: string;
      /** True when this call returned an existing still-valid awaiting-consent session. */
      reused: boolean;
      disclosure: LiveTestDisclosure;
      trigger: { nodeId: string; provider: string; eventType: string };
    }
  | { ok: false; reason: "workflow_not_found" }
  | { ok: false; reason: "not_authorized" }
  /** Canonical readiness refused — the existing actionable issue shape rides along. */
  | { ok: false; reason: "not_ready"; readiness: ReadinessError }
  | { ok: false; reason: "integration_unavailable"; provider: string }
  | { ok: false; reason: "no_trigger" }
  /** No capture adapter registered for this trigger — a visible, typed unsupported. */
  | { ok: false; reason: "trigger_capture_unsupported"; provider: string; eventType: string }
  /** A session is already listening/capturing/running — cancel it first. */
  | { ok: false; reason: "session_in_progress"; sessionId: string; status: LiveTestSessionStatus };

export type StartLiveTestResult =
  | { ok: true; status: LiveTestSessionStatusDto; alreadyListening: boolean }
  | { ok: false; reason: "session_not_found" }
  | { ok: false; reason: "not_authorized" }
  /** Wrong/missing nonce — the caller never learns whether the session exists beyond this. */
  | { ok: false; reason: "invalid_nonce" }
  /** The saved workflow changed after disclosure — re-prepare and re-review. */
  | { ok: false; reason: "stale_definition" }
  /** The bound connection selection changed after disclosure — re-prepare and re-review. */
  | { ok: false; reason: "stale_connections" }
  | { ok: false; reason: "not_ready"; readiness: ReadinessError }
  | { ok: false; reason: "integration_unavailable"; provider: string }
  | { ok: false; reason: "trigger_capture_unsupported" }
  /** Baseline creation failed — session stays awaiting_consent; retry is safe. */
  | { ok: false; reason: "baseline_failed"; retryable: true }
  | { ok: false; reason: "session_expired" }
  | { ok: false; reason: "session_cancelled" }
  | { ok: false; reason: "conflict"; status: LiveTestSessionStatus };

export type SessionStatusResult =
  | { ok: true; status: LiveTestSessionStatusDto }
  | { ok: false; reason: "session_not_found" }
  | { ok: false; reason: "not_authorized" };

export type CancelLiveTestResult =
  | { ok: true; status: LiveTestSessionStatusDto; alreadyCancelled: boolean }
  | { ok: false; reason: "session_not_found" }
  | { ok: false; reason: "not_authorized" }
  /** Execution already began — side effects may exist; nothing is claimed rolled back. */
  | { ok: false; reason: "execution_already_started"; status: LiveTestSessionStatusDto };

export type CaptureAttemptOutcome =
  | { ok: true; captured: false }
  | { ok: true; captured: true; status: LiveTestSessionStatusDto }
  | { ok: false; reason: "session_not_found" }
  /** The session left waiting_for_trigger (cancelled / expired / already captured). */
  | { ok: false; reason: "not_listening"; status: LiveTestSessionStatus }
  | { ok: false; reason: "adapter_unavailable" }
  | { ok: false; reason: "invalid_payload" }
  /** Adapter identity did not match the session's trigger binding. */
  | { ok: false; reason: "adapter_mismatch" };

/**
 * Non-fatal advisories from a status-poll advancement tick (WORKFLOW-LIVE-TEST-4 §2). The
 * session is still honest in `status`; the advisory explains why it has not moved forward.
 */
export type LiveTestAdvanceAdvisory =
  /** Captured, but the account's task limit blocks execution — recoverable until the TTL. */
  | "usage_limit_reached"
  /** This tick's provider inspection failed transiently; listening continues. */
  | "capture_error";

export type AdvanceLiveTestResult =
  | {
      ok: true;
      status: LiveTestSessionStatusDto;
      advisory: LiveTestAdvanceAdvisory | null;
      /**
       * Set when THIS tick (or a prior converged one) authorized the canonical run — the route
       * kicks the queue drain for it via `after()`. Null when nothing is executable yet.
       */
      queuedRunId: string | null;
    }
  | { ok: false; reason: "session_not_found" };

export type AuthorizeLiveTestResult =
  | { ok: true; runId: string; alreadyAuthorized: boolean }
  | { ok: false; reason: "session_not_found" }
  | { ok: false; reason: "not_eligible"; status: LiveTestSessionStatus }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "stale_definition" }
  | { ok: false; reason: "stale_connections" }
  | { ok: false; reason: "not_ready" }
  | { ok: false; reason: "integration_unavailable"; provider: string }
  | { ok: false; reason: "not_authorized" }
  /** Task limit reached — session left recoverable in trigger_received until its TTL. */
  | { ok: false; reason: "usage_limit_reached" };
