import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveTypeformWebhook } from "@/integrations/typeform/triggers/newResponseInForm/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Typeform trigger registration (activation,
// deactivation, P-S2 formId filter) at module load. Without it a cold
// serverless invocation of this route would dispatch events with the filter
// registry empty — match-all — and misfire cross-form workflows.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/typeform
 *
 * Slice 5.TYPEFORM-1. Single route for the Typeform form webhook trigger
 * (`new_response_in_form`). Mirrors `app/api/webhooks/asana` minus the
 * creation handshake (V2 mints the Typeform secret itself and sends it
 * in the webhook PUT body).
 *
 *   - Reads the raw body BEFORE parsing — the HMAC is over those bytes.
 *   - **Events**: `Typeform-Signature` (`sha256=` + base64 HMAC-SHA256
 *     over the raw body, keyed with THAT webhook's stored secret)
 *     verified after row resolution. Mismatch/missing/malformed → 401.
 *     Unknown row → 200 quiet ack. Secretless row (aborted activation)
 *     → 200 quiet ack, nothing dispatched. Non-`form_response` event
 *     types → 200 quiet ack.
 *   - **NEVER 404/410** for quiet-ack states — Typeform disables the
 *     webhook immediately on those statuses (documented retry policy).
 *   - On success → normalize → `dispatchTriggerEvent`
 *     (`webhook_event_dedup` on the response-token dedup key; paused /
 *     disabled workflows dropped by the dispatcher's state gate; the
 *     P-S2 formId filter scopes the fan-out).
 *
 * 5xx on dispatch failure so Typeform retries (escalating intervals per
 * the documented retry policy).
 */
export async function POST(request: Request) {
  // Capture raw body BEFORE parse — the signature is over these bytes.
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveTypeformWebhook>>;
  try {
    result = await receiveTypeformWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.typeform.receive_error",
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
        event: "webhook.typeform.unverifiable_row",
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "ignored_event") {
    return NextResponse.json({ ok: true, dispatched: 0, ignored: true });
  }

  // Dispatch each event. Failures here return 5xx so Typeform retries.
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
        event: "webhook.typeform.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/typeform
 *
 * Service-info endpoint. Typeform has no GET-time challenge (and no
 * creation handshake at all — the signing secret is client-supplied at
 * webhook PUT time). Returns a JSON description so accidental GET
 * requests don't 404 — Typeform disables webhooks that receive 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "typeform webhook",
    description:
      "POST form_response events here. Per-webhook signature verified via Typeform-Signature (sha256= + base64 HMAC-SHA256 over the raw body, keyed with the secret registered at trigger activation).",
  });
}
