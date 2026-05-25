import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveOneDriveWebhook } from "@/integrations/microsoft-onedrive/webhooks/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the OneDrive trigger's
// activation/deactivation/subscription registrations at module load.
// Without it, the receive path's subscription lookup would run but the
// renewal cron and lifecycle deactivate hook would be missing.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/microsoft-onedrive
 *
 * Slice 8 plan §"Webhook receive":
 *   - Validation handshake. `?validationToken=...` query OR text/plain
 *     body → echo as text/plain 200 within 10s. Route must NOT do DB
 *     I/O on this branch.
 *   - Notification. Parse envelope → per-notification trigger lookup +
 *     clientState verify + branch dispatch (id-fetch vs delta-fallback)
 *     + normalize → dispatch.
 *   - 200 once events are durably enqueued. 5xx if enqueue fails so
 *     Microsoft retries.
 *   - 401 only on a genuinely-corrupt body that's neither validation
 *     nor a parseable notification envelope.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveOneDriveWebhook>>;
  try {
    result = await receiveOneDriveWebhook(request);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.microsoft_onedrive.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "validation") {
    return new NextResponse(result.token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Dispatch each event. Failures here return 5xx so Microsoft retries.
  try {
    let dispatched = 0;
    for (const event of result.events) {
      const r = await dispatchTriggerEvent(event);
      dispatched += r.enqueued;
    }
    return NextResponse.json({ ok: true, dispatched });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.microsoft_onedrive.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/microsoft-onedrive
 *
 * Some Microsoft tooling probes the validation endpoint via GET. Honor
 * the `validationToken` query param the same way; otherwise return a
 * service-info JSON payload.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const validationToken =
    url.searchParams.get("validationToken") ??
    url.searchParams.get("validationtoken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({
    service: "microsoft-onedrive webhook",
    description: "POST notifications here. Validation handshake supported.",
  });
}
