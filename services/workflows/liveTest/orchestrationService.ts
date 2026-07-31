import * as sessionsRepo from "@/repositories/liveTest/workflowLiveTestSessions";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isPreExecutionLiveTestStatus } from "@/core/workflows/liveTest/liveTestSessionLifecycle";
import { attemptLiveTestCapture } from "./captureService";
import { authorizeLiveTestExecution } from "./authorizeService";
import { toStatusDto } from "./sessionService";
import type { AdvanceLiveTestResult, LiveTestAdvanceAdvisory } from "./types";

/**
 * Serverless-safe live-test orchestration (WORKFLOW-LIVE-TEST-4 §2).
 *
 * There is no resident worker: the owner's own status polling drives the state machine forward,
 * one bounded step per request, entirely inside ordinary request lifecycles. Each tick:
 *
 *   waiting_for_trigger → ONE bounded capture attempt (the registered adapter's single
 *                          inspection; the capture service re-checks cancellation/expiry and
 *                          owns the guarded transition), then — if captured — falls through to
 *   trigger_received    → ONE authorization attempt (the §12 full-revalidation checklist +
 *                          atomic claim). The caller kicks the queue drain for the authorized
 *                          run; the process-run-queue cron remains the durability net.
 *
 * Convergence properties this inherits for free: every transition is a guarded compare-and-set,
 * capture and authorization are idempotent under retry, and duplicate ticks (two tabs, a slow
 * request racing a fast one) collapse onto the same session row / same run id. A tick that
 * fails transiently reports an ADVISORY next to the honest status — never a fake state.
 *
 * TRUST: the tick is triggered by an authenticated session OWNER's poll, but nothing about the
 * advancement consumes client input — the poll merely prompts the server to look. Membership is
 * revalidated here exactly like the status read; non-members collapse to session_not_found.
 * Pacing note: each poll costs one bounded read against the OWNER's own provider quota; the
 * client polls at a civil interval, and a hostile owner hammering the endpoint only spends
 * their own quota (the capture service still enforces every guard).
 */

const MEMBER_ROLES = ["owner", "admin", "member"] as const;

export async function advanceLiveTestSession(input: {
  sessionId: string;
  workflowId: string;
  userId: string;
}): Promise<AdvanceLiveTestResult> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session || session.workflowId !== input.workflowId) {
    return { ok: false, reason: "session_not_found" };
  }
  const role = await requireAccountRole(input.userId, session.accountId, MEMBER_ROLES);
  if (!role.ok) return { ok: false, reason: "session_not_found" }; // no existence leak

  // Lazy honest expiry first — a lapsed pre-execution session reads (and becomes) expired
  // without ever touching the provider.
  if (
    isPreExecutionLiveTestStatus(session.status) &&
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    const expired = await sessionsRepo.expireSessionIfDue(session.id, new Date().toISOString());
    if (expired) return { ok: true, status: toStatusDto(expired), advisory: null, queuedRunId: null };
  }

  let advisory: LiveTestAdvanceAdvisory | null = null;
  let current = session;

  if (current.status === "waiting_for_trigger") {
    try {
      const attempt = await attemptLiveTestCapture({ sessionId: current.id });
      if (attempt.ok && attempt.captured) {
        // Fall through to authorization with the fresh row.
        current = (await sessionsRepo.getSessionById(current.id)) ?? current;
      } else if (!attempt.ok && attempt.reason === "not_listening") {
        // Cancelled/expired/captured-by-a-racing-tick — report whatever is now true.
        current = (await sessionsRepo.getSessionById(current.id)) ?? current;
      } else if (!attempt.ok) {
        // adapter_unavailable / invalid_payload / adapter_mismatch — a wiring problem, not a
        // user problem. Keep listening honestly and surface a transient advisory.
        advisory = "capture_error";
        console.error(
          JSON.stringify({
            event: "live_test.advance.capture_refused",
            sessionId: current.id,
            reason: attempt.reason,
          }),
        );
      }
    } catch (err) {
      // The adapter threw (provider 5xx, token refresh failure). Listening continues; this
      // tick simply found nothing. Logged server-side, advised client-side without detail.
      advisory = "capture_error";
      console.error(
        JSON.stringify({
          event: "live_test.advance.capture_failed",
          sessionId: current.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  let queuedRunId: string | null = null;
  if (current.status === "trigger_received") {
    const auth = await authorizeLiveTestExecution({ sessionId: current.id });
    if (auth.ok) {
      queuedRunId = auth.runId;
      current = (await sessionsRepo.getSessionById(current.id)) ?? current;
    } else if (auth.reason === "usage_limit_reached") {
      // Deliberately NOT a failure: the session stays trigger_received until its TTL so an
      // upgraded account can execute the SAME captured event.
      advisory = "usage_limit_reached";
    } else {
      // The authorization service already failed the session with a typed code (or it was
      // cancelled/expired mid-flight) — re-read so the response reports the real state.
      current = (await sessionsRepo.getSessionById(current.id)) ?? current;
    }
  } else if (current.status === "running" && current.workflowRunId) {
    // A previous tick authorized but its drain kick may have been lost with the instance —
    // hand the run id back so the caller can kick again (the drain is claim-guarded and a
    // no-op for an already-executed run).
    queuedRunId = current.workflowRunId;
  }

  return { ok: true, status: toStatusDto(current), advisory, queuedRunId };
}
