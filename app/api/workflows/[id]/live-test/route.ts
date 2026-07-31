import { NextResponse } from "next/server";
import {
  assertWorkflowRunEditAllowed,
  requireUser,
  requireWorkflowAccountMember,
  workflowNotFoundResponse,
} from "../../_shared";
import * as workflowsRepo from "@/repositories/workflows";
import { prepareLiveTestSession } from "@/services/workflows/liveTest/sessionService";

/**
 * POST /api/workflows/[id]/live-test — prepare a live-test session (WORKFLOW-LIVE-TEST-3 §14).
 *
 * Returns the awaiting-consent session (id + nonce + expiry), the generated side-effect
 * disclosure, and the trigger binding — and does NOTHING else: no provider call, no polling, no
 * run, no usage. Consent is a SEPARATE explicit action (`.../start`).
 *
 * The request carries NO body of consequence: the server derives the workflow hash, connection
 * bindings, disclosure, and nonce from saved state. There is no `allowRealCalls`, no
 * `executionOrigin`, no connection substitution — fields like that simply do not parse here.
 *
 * Auth stack mirrors run-now: signed-in user → account membership (404 on non-member, no
 * existence leak) → private-credential creator-pin (`assertWorkflowRunEditAllowed`) — a live
 * test runs real credentials, so it is gated like a real run, not like a read.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const workflow = await workflowsRepo.getById(id);
  if (!workflow || workflow.state === "deleted") return workflowNotFoundResponse();
  const member = await requireWorkflowAccountMember(auth.userId, workflow.accountId);
  if (!member.ok) return member.response;
  const runEditDenied = await assertWorkflowRunEditAllowed(workflow, auth.userId);
  if (runEditDenied) return runEditDenied;

  const result = await prepareLiveTestSession({ workflowId: id, userId: auth.userId });
  if (result.ok) {
    return NextResponse.json(
      {
        sessionId: result.sessionId,
        nonce: result.nonce,
        expiresAt: result.expiresAt,
        reused: result.reused,
        disclosure: result.disclosure,
        trigger: result.trigger,
      },
      { status: result.reused ? 200 : 201 },
    );
  }
  switch (result.reason) {
    case "workflow_not_found":
    case "not_authorized":
      return workflowNotFoundResponse();
    case "not_ready":
      // The existing actionable readiness shape — same envelope run-now's preflight uses.
      return NextResponse.json(
        { error: "WORKFLOW_NOT_READY", code: "not_ready", readiness: result.readiness },
        { status: 422 },
      );
    case "no_trigger":
      return NextResponse.json(
        { error: "This workflow has no trigger to test.", code: "no_trigger" },
        { status: 422 },
      );
    case "integration_unavailable":
      return NextResponse.json(
        {
          error: `Reconnect ${result.provider} before starting a live test.`,
          code: "integration_unavailable",
          provider: result.provider,
        },
        { status: 409 },
      );
    case "trigger_capture_unsupported":
      return NextResponse.json(
        {
          error: "Live trigger capture is not yet supported for this trigger.",
          code: "trigger_capture_unsupported",
          provider: result.provider,
          eventType: result.eventType,
        },
        { status: 422 },
      );
    case "session_in_progress":
      return NextResponse.json(
        {
          error: "A live test for this workflow is already in progress. Cancel it first.",
          code: "session_in_progress",
          sessionId: result.sessionId,
          status: result.status,
        },
        { status: 409 },
      );
  }
}
