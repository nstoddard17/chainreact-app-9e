import { NextResponse, after } from "next/server";
import { requireUser } from "../../../_shared";
import { cancelLiveTestSession } from "@/services/workflows/liveTest/sessionService";
import { advanceLiveTestSession } from "@/services/workflows/liveTest/orchestrationService";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
// Side-effect import: populates the live-capture adapter registry (same pattern as the
// poll-triggers cron route) so a listening session's capture attempt can find its adapter.
import "@/integrations/_registry";

/**
 * GET    /api/workflows/[id]/live-test/[sessionId] — safe session status + ONE advancement tick.
 * DELETE /api/workflows/[id]/live-test/[sessionId] — cancel a pre-execution session.
 * (WORKFLOW-LIVE-TEST-3 §8/§14 · WORKFLOW-LIVE-TEST-4 §2.)
 *
 * WORKFLOW-LIVE-TEST-4: the status poll IS the serverless capture loop. Each authenticated
 * owner poll performs one bounded advancement step server-side (capture attempt while
 * listening; authorization once captured) and then reports the honest status. The client still
 * supplies ONLY ids — the poll prompts the server to look, it cannot submit an event, a
 * baseline, or an authorization. When a tick authorizes the canonical run, the drain is kicked
 * via `after()` exactly like run-now; the process-run-queue cron remains the durability net.
 *
 * The status DTO is the ONLY session projection a client receives: status, timestamps, the safe
 * trigger preview, run id, typed failure — never the nonce, the raw captured payload, the
 * listening baseline, tokens, or credentials (those are not even fields of the DTO type).
 * `advisory` adds a typed, detail-free hint (usage limit / transient capture problem).
 *
 * Ownership is enforced in the service (membership on the session's account, workflow-id match);
 * a non-member or wrong-workflow read collapses to the same 404 — no cross-account existence
 * leak. Cancellation is idempotent, works only pre-execution, and once execution has begun
 * returns a typed 409 that NEVER claims side effects were rolled back.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, sessionId } = await params;

  const result = await advanceLiveTestSession({
    sessionId,
    workflowId: id,
    userId: auth.userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Live test session not found.", code: "session_not_found" },
      { status: 404 },
    );
  }
  if (result.queuedRunId) {
    const runId = result.queuedRunId;
    // Best-effort immediate drain, durable via the cron if the instance is reclaimed. The
    // processor claims the row (single winner) and never throws.
    after(processQueuedRun(runId));
  }
  return NextResponse.json({
    session: result.status,
    ...(result.advisory ? { advisory: result.advisory } : {}),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, sessionId } = await params;

  const result = await cancelLiveTestSession({
    sessionId,
    workflowId: id,
    userId: auth.userId,
  });
  if (result.ok) {
    return NextResponse.json({
      session: result.status,
      alreadyCancelled: result.alreadyCancelled,
    });
  }
  switch (result.reason) {
    case "session_not_found":
    case "not_authorized":
      return NextResponse.json(
        { error: "Live test session not found.", code: "session_not_found" },
        { status: 404 },
      );
    case "execution_already_started":
      return NextResponse.json(
        {
          error:
            "The live test already started running. It cannot be cancelled, and external changes it made are not rolled back.",
          code: "execution_already_started",
          session: result.status,
        },
        { status: 409 },
      );
  }
}
