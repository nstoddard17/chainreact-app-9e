import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveMotiveWebhook } from "@/integrations/motive/triggers/_shared/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the 7 Motive trigger registrations (activation,
// deactivation, P-S2 company filters) at module load. Without it a cold
// serverless invocation of this route would dispatch events with the company
// filter registry empty (match-all) and misfire cross-company workflows.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/motive
 *
 * MOTIVE-1. Single route for all 7 Motive company-webhook triggers. Mirrors
 * `app/api/webhooks/asana` minus the creation handshake (V2 supplies the secret
 * at `POST /v1/company_webhooks` time).
 *
 *   - Reads the raw body BEFORE parsing — the HMAC is over those bytes.
 *   - `X-KT-Webhook-Signature` (HMAC-SHA1 hex over the raw body, keyed with the
 *     row's stored secret) verified after row resolution. Mismatch/missing/
 *     malformed → 401. Unknown row → 200 quiet ack. Secretless row (activation
 *     not yet committed) → 200 quiet ack, nothing dispatched (Motive retries).
 *   - On success → normalize → `dispatchTriggerEvent` (`webhook_event_dedup` on
 *     the deterministic per-event id; paused/disabled workflows dropped by the
 *     dispatcher; the P-S2 company filter scopes the fan-out).
 *
 * Motive expects an ack within 3s and retries at ~1m/1h/6h on failure. 5xx on
 * dispatch failure so Motive retries; dedup collapses the redelivery.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveMotiveWebhook>>;
  try {
    result = await receiveMotiveWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.motive.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json({ error: "Webhook receive failed." }, { status: 500 });
  }

  if (result.kind === "unknown_workflow") {
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unverifiable") {
    console.warn(JSON.stringify({ event: "webhook.motive.unverifiable_row" }));
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

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
        event: "webhook.motive.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/motive
 *
 * Service-info endpoint (Motive has no GET-time challenge). Returns a JSON
 * description so accidental GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "motive webhook",
    description:
      "POST events here. Per-webhook signature verified via X-KT-Webhook-Signature (HMAC-SHA1 hex over the raw body, keyed with the webhook secret V2 set at creation).",
  });
}
