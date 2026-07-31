import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../_shared";
import { startLiveTestListening } from "@/services/workflows/liveTest/sessionService";

/**
 * POST /api/workflows/[id]/live-test/[sessionId]/start — the EXPLICIT consent action
 * (WORKFLOW-LIVE-TEST-3 §7/§14).
 *
 * Body: `{ nonce }` — the server-issued secret returned once by prepare. STRICT schema: the only
 * accepted field is the nonce. There is no baseline, no connection list, no workflow definition,
 * no `allowRealCalls` — a client cannot alter what it consented to, only prove it is the party
 * that prepared it. Everything else (fingerprint, bindings, disclosure equality, baseline) is
 * re-derived server-side, and any drift since disclosure is a typed stale rejection.
 *
 * Opening the disclosure never calls this route; only the user's explicit Start action does.
 */
const startBodySchema = z.object({ nonce: z.string().min(1).max(256) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, sessionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "invalid_body" },
      { status: 400 },
    );
  }
  const parsed = startBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request body must be exactly { nonce }.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const result = await startLiveTestListening({
    sessionId,
    workflowId: id,
    userId: auth.userId,
    nonce: parsed.data.nonce,
  });
  if (result.ok) {
    return NextResponse.json({
      session: result.status,
      alreadyListening: result.alreadyListening,
    });
  }
  switch (result.reason) {
    case "session_not_found":
    case "not_authorized":
      return NextResponse.json(
        { error: "Live test session not found.", code: "session_not_found" },
        { status: 404 },
      );
    case "invalid_nonce":
      return NextResponse.json(
        { error: "This live test session cannot be started from here. Prepare it again.", code: "invalid_nonce" },
        { status: 403 },
      );
    case "stale_definition":
      return NextResponse.json(
        {
          error: "The workflow changed after the side effects were reviewed. Review them again.",
          code: "stale_definition",
        },
        { status: 409 },
      );
    case "stale_connections":
      return NextResponse.json(
        {
          error: "The connected apps changed after the side effects were reviewed. Review them again.",
          code: "stale_connections",
        },
        { status: 409 },
      );
    case "not_ready":
      return NextResponse.json(
        { error: "WORKFLOW_NOT_READY", code: "not_ready", readiness: result.readiness },
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
        { error: "Live trigger capture is not yet supported for this trigger.", code: "trigger_capture_unsupported" },
        { status: 422 },
      );
    case "baseline_failed":
      return NextResponse.json(
        {
          error: "Could not start listening. Nothing was started — try again.",
          code: "baseline_failed",
          retryable: true,
        },
        { status: 502 },
      );
    case "session_expired":
      return NextResponse.json(
        { error: "This live test session expired before it was started. Prepare it again.", code: "session_expired" },
        { status: 409 },
      );
    case "session_cancelled":
      return NextResponse.json(
        { error: "This live test session was cancelled.", code: "session_cancelled" },
        { status: 409 },
      );
    case "conflict":
      return NextResponse.json(
        { error: "This live test session is not awaiting consent.", code: "conflict", status: result.status },
        { status: 409 },
      );
  }
}
