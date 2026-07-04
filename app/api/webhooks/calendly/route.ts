import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveCalendlyWebhook } from "@/integrations/calendly/triggers/_shared/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Calendly trigger registrations
// (activation, deactivation, P-S2 subscriber/event-type filters) at
// module load. Without it a cold serverless invocation of this route
// would dispatch events with the filter registry empty — match-all —
// and misfire cross-user workflows.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/calendly
 *
 * Slice 5.CALENDLY-1. Single route for both Calendly webhook triggers
 * (`event_scheduled`, `event_canceled`). Mirrors
 * `app/api/webhooks/typeform` (caller-minted per-subscription secret,
 * no creation handshake) with the two-trigger shared receive of
 * `app/api/webhooks/asana`.
 *
 *   - Reads the raw body BEFORE parsing — the HMAC is over those bytes.
 *   - **Events**: `Calendly-Webhook-Signature`
 *     (`t=<unix>,v1=<hex HMAC-SHA256 over "<t>.<raw body>">`, keyed with
 *     THAT subscription's stored signing key) verified after row
 *     resolution. Mismatch/missing/malformed/stale → 401. Unknown row →
 *     200 quiet ack. Secretless row (aborted activation) → 200 quiet
 *     ack, nothing dispatched. Unsupported or row-mismatched event
 *     types → 200 quiet ack.
 *   - On success → normalize → `dispatchTriggerEvent`
 *     (`webhook_event_dedup` on the subscriber-scoped invitee dedup
 *     key; paused / disabled workflows dropped by the dispatcher's
 *     state gate; the P-S2 subscriber/event-type filter scopes the
 *     fan-out).
 *
 * 5xx on dispatch failure so Calendly retries (exponential backoff for
 * up to 24h per the documented retry policy; sustained failure disables
 * the subscription provider-side).
 */
export async function POST(request: Request) {
  // Capture raw body BEFORE parse — the signature is over these bytes.
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveCalendlyWebhook>>;
  try {
    result = await receiveCalendlyWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.calendly.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_workflow") {
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unverifiable") {
    console.warn(
      JSON.stringify({
        event: "webhook.calendly.unverifiable_row",
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "ignored_event") {
    return NextResponse.json({ ok: true, dispatched: 0, ignored: true });
  }

  // Dispatch each event. Failures here return 5xx so Calendly retries.
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
        event: "webhook.calendly.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/calendly
 *
 * Service-info endpoint. Calendly has no GET-time challenge (and no
 * creation handshake at all — the signing key is client-supplied at
 * subscription POST time). Returns a JSON description so accidental GET
 * requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "calendly webhook",
    description:
      "POST invitee.created / invitee.canceled events here. Per-subscription signature verified via Calendly-Webhook-Signature (t=<unix>,v1=<hex HMAC-SHA256 over '<t>.<raw body>'>, keyed with the signing key registered at trigger activation).",
  });
}
