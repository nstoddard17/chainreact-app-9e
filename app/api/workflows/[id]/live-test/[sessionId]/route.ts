import { NextResponse } from "next/server";
import { requireUser } from "../../../_shared";
import {
  cancelLiveTestSession,
  getLiveTestSessionStatus,
} from "@/services/workflows/liveTest/sessionService";

/**
 * GET    /api/workflows/[id]/live-test/[sessionId] — safe session status.
 * DELETE /api/workflows/[id]/live-test/[sessionId] — cancel a pre-execution session.
 * (WORKFLOW-LIVE-TEST-3 §8/§14.)
 *
 * The status DTO is the ONLY session projection a client receives: status, timestamps, the safe
 * trigger preview, run id, typed failure — never the nonce, the raw captured payload, the
 * listening baseline, tokens, or credentials (those are not even fields of the DTO type).
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

  const result = await getLiveTestSessionStatus({
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
  return NextResponse.json({ session: result.status });
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
