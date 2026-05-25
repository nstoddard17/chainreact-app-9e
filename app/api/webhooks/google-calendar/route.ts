import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveCalendarWebhook } from "@/integrations/google-calendar/webhooks/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces Calendar's activation/deactivation/subscription
// registrations at module load. Without it, the receive path's pull would
// run but the renewal cron and lifecycle deactivate hook would be missing.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/google-calendar
 *
 * Per docs/rules/webhook-receipt-routes.md §"V2 intended behavior":
 *   - Thin route. Verification + parsing in receive.ts; dispatch via
 *     services/triggers/dispatch.ts.
 *   - 200 once events are durably enqueued. 5xx if enqueue fails so
 *     Google retries.
 *   - 401 only on genuine spoof (token mismatch on a registered channel).
 *     Unknown-channel notifications return 200 to avoid retries during
 *     normal channel-stop lifecycle.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveCalendarWebhook>>;
  try {
    result = await receiveCalendarWebhook(request);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.google_calendar.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "handshake" || result.kind === "unknown_channel") {
    return NextResponse.json({ ok: true });
  }

  // Dispatch each event. Failures here return 5xx so Google retries.
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
        event: "webhook.google_calendar.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json(
      { error: "Dispatch failed." },
      { status: 500 },
    );
  }
}
