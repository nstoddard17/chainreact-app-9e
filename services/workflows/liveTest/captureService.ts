import { TriggerEventSchema } from "@/contracts/triggerEvent";
import * as workflowsRepo from "@/repositories/workflows";
import * as sessionsRepo from "@/repositories/liveTest/workflowLiveTestSessions";
import { getLiveTriggerCaptureAdapter } from "@/services/triggers/liveCapture/registry";
import { toStatusDto } from "./sessionService";
import type { CaptureAttemptOutcome } from "./types";

/**
 * Live-test capture orchestration (WORKFLOW-LIVE-TEST-3 §10).
 *
 * INTERNAL ONLY — no route exposes this. It is invoked by trusted server workers (next batch's
 * polling loop; today, tests) to run ONE bounded capture attempt for a listening session. A
 * browser can never submit a "captured" payload: the payload comes from the registered adapter's
 * own provider read, is validated against the canonical TriggerEvent contract, and must carry
 * the session's OWN provider/eventType (adapter identity match) before it is persisted.
 *
 * Delayed-poll defeat, twice over:
 *   1. This function re-reads the session first and refuses unless it is still
 *      waiting_for_trigger and inside its TTL (lazily expiring it when past due).
 *   2. Even a poll that raced past the read dies at `recordCapturedTrigger`'s guarded UPDATE —
 *      a session cancelled or expired mid-flight matches zero rows, so the capture is dropped
 *      on the floor and can never reach authorization.
 *
 * A duplicate capture (two workers, one session) converges the same way: one wins the guarded
 * transition to trigger_received; the loser's update matches nothing and reports the current
 * state. No production cursor or dedup record is read or written anywhere on this path.
 */
export async function attemptLiveTestCapture(input: {
  sessionId: string;
}): Promise<CaptureAttemptOutcome> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };

  if (session.status !== "waiting_for_trigger") {
    return { ok: false, reason: "not_listening", status: session.status };
  }
  if (Date.parse(session.expiresAt) <= Date.now()) {
    const expired = await sessionsRepo.expireSessionIfDue(session.id, new Date().toISOString());
    return { ok: false, reason: "not_listening", status: expired?.status ?? "expired" };
  }

  const adapter = getLiveTriggerCaptureAdapter(session.triggerProvider, session.triggerEventType);
  if (!adapter) return { ok: false, reason: "adapter_unavailable" };
  // Belt-and-braces identity check: the registry key and the session binding must agree.
  if (
    adapter.providerId !== session.triggerProvider ||
    adapter.eventType !== session.triggerEventType
  ) {
    return { ok: false, reason: "adapter_mismatch" };
  }

  const workflow = await workflowsRepo.getByIdServiceRole(session.workflowId);
  const triggerConfig =
    (workflow?.draftDefinition.nodes.find((n) => n.id === session.triggerNodeId)?.config as
      | Record<string, unknown>
      | undefined) ?? {};

  const attempt = await adapter.captureNext(
    {
      accountId: session.accountId,
      workflowId: session.workflowId,
      sessionId: session.id,
      triggerConfig,
    },
    session.captureBaseline ?? {},
  );
  if (attempt.status === "waiting") return { ok: true, captured: false };

  // Canonical payload contract + adapter identity, both fail-closed.
  const parsed = TriggerEventSchema.safeParse(attempt.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };
  if (
    parsed.data.provider !== session.triggerProvider ||
    parsed.data.eventType !== session.triggerEventType
  ) {
    return { ok: false, reason: "adapter_mismatch" };
  }

  const recorded = await sessionsRepo.recordCapturedTrigger({
    sessionId: session.id,
    capturedEvent: parsed.data,
    triggerPreview: attempt.preview,
    capturedAt: new Date().toISOString(),
  });
  if (!recorded.ok) {
    // Cancelled/expired/duplicate mid-flight — the guarded update refused; nothing persisted.
    return {
      ok: false,
      reason: "not_listening",
      status: recorded.current?.status ?? "cancelled",
    };
  }
  return { ok: true, captured: true, status: toStatusDto(recorded.session) };
}
