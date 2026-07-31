import { randomUUID, timingSafeEqual } from "node:crypto";
import * as workflowsRepo from "@/repositories/workflows";
import * as sessionsRepo from "@/repositories/liveTest/workflowLiveTestSessions";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";
import {
  getLiveTriggerCaptureAdapter,
  isLiveCaptureSupported,
} from "@/services/triggers/liveCapture/registry";
import {
  isPreExecutionLiveTestStatus,
  type LiveTestSessionStatus,
} from "@/core/workflows/liveTest/liveTestSessionLifecycle";
import { collectConnectionBindings, connectionIdsEqual } from "./connectionBindings";
import { computeWorkflowFingerprint } from "./workflowFingerprint";
import { generateLiveTestDisclosure } from "./disclosure";
import {
  AWAITING_CONSENT_TTL_MS,
  LISTENING_WINDOW_MS,
  type CancelLiveTestResult,
  type LiveTestSessionStatusDto,
  type PrepareLiveTestResult,
  type SessionStatusResult,
  type StartLiveTestResult,
} from "./types";

/**
 * Live-test session services: prepare / start / status / cancel
 * (WORKFLOW-LIVE-TEST-3 §5/§7/§8).
 *
 * Trust model, uniform across every operation:
 *   - The caller supplies ONLY ids (+ the nonce on start). Account, workflow hash, connection
 *     bindings, disclosure, and baseline are all derived server-side from saved state.
 *   - Membership is revalidated here (`requireAccountRole`) even though the routes also gate —
 *     services never assume their caller checked.
 *   - Guarded repository updates are the final concurrency authority; these services only
 *     pre-check to produce better typed errors.
 *
 * Consent staleness: prepare freezes the workflow fingerprint (definition + sorted bound
 * connection ids) onto the session. Start and authorization RE-derive both and refuse on any
 * difference — the user reviews the side effects of what will actually run, or nothing runs.
 */

export function toStatusDto(s: sessionsRepo.LiveTestSessionRecord): LiveTestSessionStatusDto {
  return {
    sessionId: s.id,
    workflowId: s.workflowId,
    status: s.status,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    consentedAt: s.consentedAt,
    triggerCapturedAt: s.triggerCapturedAt,
    triggerPreview: (s.triggerPreview as Readonly<Record<string, string | null>> | null) ?? null,
    workflowRunId: s.workflowRunId,
    failureCode: s.failureCode,
    failureMessage: s.failureMessage,
    canCancel: isPreExecutionLiveTestStatus(s.status),
  };
}

const MEMBER_ROLES = ["owner", "admin", "member"] as const;

/** Constant-time nonce comparison; length mismatch is an immediate (still uniform) reject. */
function nonceMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── prepare ──────────────────────────────────────────────────────────────────

export async function prepareLiveTestSession(input: {
  workflowId: string;
  userId: string;
}): Promise<PrepareLiveTestResult> {
  const workflow = await workflowsRepo.getByIdServiceRole(input.workflowId);
  if (!workflow || workflow.state === "deleted") return { ok: false, reason: "workflow_not_found" };

  const role = await requireAccountRole(input.userId, workflow.accountId, MEMBER_ROLES);
  // Non-members collapse to not-found upstream at the route; here the typed reason suffices.
  if (!role.ok) return { ok: false, reason: "not_authorized" };

  // Canonical readiness FIRST — no session, no provider call, for an incomplete workflow.
  const readiness = checkWorkflowReadiness(workflow.draftDefinition);
  if (readiness) return { ok: false, reason: "not_ready", readiness };

  const bindings = await collectConnectionBindings({
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
  });
  if (!bindings.ok) {
    return bindings.reason === "no_trigger"
      ? { ok: false, reason: "no_trigger" }
      : { ok: false, reason: "integration_unavailable", provider: bindings.provider };
  }

  if (!isLiveCaptureSupported(bindings.trigger.provider, bindings.trigger.eventType)) {
    return {
      ok: false,
      reason: "trigger_capture_unsupported",
      provider: bindings.trigger.provider,
      eventType: bindings.trigger.eventType,
    };
  }

  const definitionHash = computeWorkflowFingerprint({
    workflowId: workflow.id,
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
    connectionIds: bindings.connectionIds,
  });
  const disclosure = generateLiveTestDisclosure(workflow.draftDefinition);

  // One live session per workflow (DB partial unique index is the authority). Reuse a still-
  // valid awaiting-consent session for the SAME fingerprint; replace a stale/expired one;
  // refuse to displace a session that is already listening or further — the user (or another
  // tab) must cancel deliberately.
  const active = await sessionsRepo.getActiveSessionForWorkflow(workflow.id);
  if (active) {
    const expired = Date.parse(active.expiresAt) <= Date.now();
    if (active.status === "awaiting_consent" && !expired && active.definitionHash === definitionHash) {
      return {
        ok: true,
        sessionId: active.id,
        nonce: active.nonce,
        expiresAt: active.expiresAt,
        reused: true,
        disclosure,
        trigger: bindings.trigger,
      };
    }
    if (active.status === "awaiting_consent") {
      // Stale hash or lapsed TTL — replace via an explicit cancel (guarded; loser of a race
      // simply finds the slot still occupied below).
      await sessionsRepo.cancelSession({ sessionId: active.id, accountId: workflow.accountId });
    } else {
      return {
        ok: false,
        reason: "session_in_progress",
        sessionId: active.id,
        status: active.status,
      };
    }
  }

  const created = await sessionsRepo.createAwaitingConsentSession({
    accountId: workflow.accountId,
    userId: input.userId,
    workflowId: workflow.id,
    definitionHash,
    triggerNodeId: bindings.trigger.nodeId,
    triggerProvider: bindings.trigger.provider,
    triggerEventType: bindings.trigger.eventType,
    connectionIds: bindings.connectionIds,
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + AWAITING_CONSENT_TTL_MS).toISOString(),
  });
  if (!created.ok) {
    // Lost a creation race — surface the winner rather than looping against the constraint.
    const winner = await sessionsRepo.getActiveSessionForWorkflow(workflow.id);
    if (winner && winner.status === "awaiting_consent" && winner.definitionHash === definitionHash) {
      return {
        ok: true,
        sessionId: winner.id,
        nonce: winner.nonce,
        expiresAt: winner.expiresAt,
        reused: true,
        disclosure,
        trigger: bindings.trigger,
      };
    }
    return {
      ok: false,
      reason: "session_in_progress",
      sessionId: winner?.id ?? "unknown",
      status: (winner?.status ?? "awaiting_consent") as LiveTestSessionStatus,
    };
  }

  return {
    ok: true,
    sessionId: created.session.id,
    nonce: created.session.nonce,
    expiresAt: created.session.expiresAt,
    reused: false,
    disclosure,
    trigger: bindings.trigger,
  };
}

// ── start (explicit consent → listening) ─────────────────────────────────────

export async function startLiveTestListening(input: {
  sessionId: string;
  workflowId: string;
  userId: string;
  nonce: string;
}): Promise<StartLiveTestResult> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session || session.workflowId !== input.workflowId) {
    return { ok: false, reason: "session_not_found" };
  }
  const role = await requireAccountRole(input.userId, session.accountId, MEMBER_ROLES);
  if (!role.ok) return { ok: false, reason: "not_authorized" };
  // Only the ACTOR who prepared (and will consent) may start — consent is personal.
  if (session.userId !== input.userId) return { ok: false, reason: "not_authorized" };
  if (!nonceMatches(session.nonce, input.nonce)) return { ok: false, reason: "invalid_nonce" };

  // Duplicate start: already listening under the same consent → idempotent success.
  if (session.status === "waiting_for_trigger") {
    return { ok: true, status: toStatusDto(session), alreadyListening: true };
  }
  if (session.status === "cancelled") return { ok: false, reason: "session_cancelled" };
  if (session.status === "expired" || Date.parse(session.expiresAt) <= Date.now()) {
    return { ok: false, reason: "session_expired" };
  }
  if (session.status !== "awaiting_consent") {
    return { ok: false, reason: "conflict", status: session.status };
  }

  // Re-derive EVERYTHING from saved state; refuse on any drift since disclosure.
  const workflow = await workflowsRepo.getByIdServiceRole(session.workflowId);
  if (!workflow || workflow.state === "deleted") return { ok: false, reason: "session_not_found" };
  const readiness = checkWorkflowReadiness(workflow.draftDefinition);
  if (readiness) return { ok: false, reason: "not_ready", readiness };
  const bindings = await collectConnectionBindings({
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
  });
  if (!bindings.ok) {
    if (bindings.reason === "no_trigger") return { ok: false, reason: "stale_definition" };
    return { ok: false, reason: "integration_unavailable", provider: bindings.provider };
  }
  if (!connectionIdsEqual(bindings.connectionIds, session.connectionIds)) {
    await sessionsRepo.failSession({
      sessionId: session.id,
      failureCode: "stale_connections",
      failureMessage: "The connected apps changed after the side effects were reviewed.",
      fromStatuses: ["awaiting_consent"],
    });
    return { ok: false, reason: "stale_connections" };
  }
  const hash = computeWorkflowFingerprint({
    workflowId: workflow.id,
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
    connectionIds: bindings.connectionIds,
  });
  if (hash !== session.definitionHash) {
    await sessionsRepo.failSession({
      sessionId: session.id,
      failureCode: "stale_definition",
      failureMessage: "The workflow changed after the side effects were reviewed.",
      fromStatuses: ["awaiting_consent"],
    });
    return { ok: false, reason: "stale_definition" };
  }

  const adapter = getLiveTriggerCaptureAdapter(
    session.triggerProvider,
    session.triggerEventType,
  );
  if (!adapter) return { ok: false, reason: "trigger_capture_unsupported" };

  // Baseline BEFORE the transition: on failure the session remains awaiting_consent, nothing is
  // marked consented, and retrying start is safe.
  let baseline;
  try {
    baseline = await adapter.establishBaseline({
      accountId: session.accountId,
      workflowId: session.workflowId,
      sessionId: session.id,
      triggerConfig:
        (workflow.draftDefinition.nodes.find((n) => n.id === session.triggerNodeId)?.config as
          | Record<string, unknown>
          | undefined) ?? {},
    });
  } catch {
    return { ok: false, reason: "baseline_failed", retryable: true };
  }

  const result = await sessionsRepo.startListening({
    sessionId: session.id,
    expectedDefinitionHash: session.definitionHash,
    captureBaseline: baseline,
    consentedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LISTENING_WINDOW_MS).toISOString(),
  });
  if (!result.ok) {
    const current = result.current;
    if (!current) return { ok: false, reason: "session_not_found" };
    if (current.status === "waiting_for_trigger") {
      return { ok: true, status: toStatusDto(current), alreadyListening: true };
    }
    if (current.status === "cancelled") return { ok: false, reason: "session_cancelled" };
    if (current.status === "expired") return { ok: false, reason: "session_expired" };
    return { ok: false, reason: "conflict", status: current.status };
  }
  return { ok: true, status: toStatusDto(result.session), alreadyListening: false };
}

// ── status ───────────────────────────────────────────────────────────────────

export async function getLiveTestSessionStatus(input: {
  sessionId: string;
  workflowId: string;
  userId: string;
}): Promise<SessionStatusResult> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session || session.workflowId !== input.workflowId) {
    return { ok: false, reason: "session_not_found" };
  }
  const role = await requireAccountRole(input.userId, session.accountId, MEMBER_ROLES);
  if (!role.ok) return { ok: false, reason: "session_not_found" }; // no cross-account existence leak

  // Lazy honest expiry: a pre-execution session past its TTL reads (and durably becomes)
  // expired — the guarded update can never touch a running/consumed session.
  if (
    isPreExecutionLiveTestStatus(session.status) &&
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    const expired = await sessionsRepo.expireSessionIfDue(session.id, new Date().toISOString());
    if (expired) return { ok: true, status: toStatusDto(expired) };
  }
  return { ok: true, status: toStatusDto(session) };
}

// ── cancel ───────────────────────────────────────────────────────────────────

export async function cancelLiveTestSession(input: {
  sessionId: string;
  workflowId: string;
  userId: string;
}): Promise<CancelLiveTestResult> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session || session.workflowId !== input.workflowId) {
    return { ok: false, reason: "session_not_found" };
  }
  const role = await requireAccountRole(input.userId, session.accountId, MEMBER_ROLES);
  if (!role.ok) return { ok: false, reason: "session_not_found" };

  const result = await sessionsRepo.cancelSession({
    sessionId: session.id,
    accountId: session.accountId,
  });
  if (result.ok) {
    return {
      ok: true,
      status: toStatusDto(result.session),
      alreadyCancelled: result.alreadyCancelled,
    };
  }
  if (result.reason === "not_found") return { ok: false, reason: "session_not_found" };
  // Execution already began — external side effects may already exist; the caller's copy must
  // never suggest anything was rolled back.
  return {
    ok: false,
    reason: "execution_already_started",
    status: toStatusDto(result.current),
  };
}
