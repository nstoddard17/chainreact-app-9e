import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveAsanaWebhook } from "@/integrations/asana/triggers/_shared/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the 2 Asana trigger registrations (activation,
// deactivation, P-S2 filters) at module load. Without it a cold serverless
// invocation of this route would dispatch events with the projectId filter
// registry empty — match-all — and misfire cross-project workflows.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/asana
 *
 * Slice 5.ASANA-1. Single route for both Asana project-webhook triggers
 * (`new_task_in_project`, `task_updated_in_project`). Mirrors
 * `app/api/webhooks/monday` with one Asana-specific addition: the
 * X-Hook-Secret creation handshake.
 *
 *   - Reads the raw body BEFORE parsing — the HMAC is over those bytes.
 *   - **Handshake** (X-Hook-Secret header present): accepted ONLY for a
 *     trigger row in its activation window (handshakePending, no stored
 *     secret) — the receive helper persists the secret (encrypted) and
 *     this route echoes the header with 200. Any other handshake-shaped
 *     request → 400 WITHOUT an echo (fails the provider-side creation;
 *     an armed row's secret can never be rotated from outside).
 *   - **Events**: `X-Hook-Signature` (HMAC-SHA256 hex over the raw body,
 *     keyed with THAT webhook's stored secret) verified after row
 *     resolution. Mismatch/missing/malformed → 401. Unknown row → 200
 *     quiet ack. Secretless row (aborted activation) → 200 quiet ack,
 *     nothing dispatched.
 *   - **Heartbeat** (empty `events`, ~8h cadence): 200 ack — Asana
 *     deletes webhooks whose deliveries fail for 24h.
 *   - On success → normalize → `dispatchTriggerEvent`
 *     (`webhook_event_dedup` on the deterministic per-event id; paused /
 *     disabled workflows dropped by the dispatcher's state gate; the
 *     P-S2 projectId filter scopes the fan-out).
 *
 * 5xx on dispatch failure so Asana retries.
 */
export async function POST(request: Request) {
  // Capture raw body BEFORE parse — the signature is over these bytes.
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveAsanaWebhook>>;
  try {
    result = await receiveAsanaWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.asana.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "handshake") {
    // Echo the X-Hook-Secret header — Asana requires the echo + 200/204
    // for POST /webhooks to succeed. The secret is already persisted
    // (encrypted) on the trigger row by the receive helper.
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Hook-Secret": result.secret },
    });
  }

  if (result.kind === "handshake_rejected") {
    console.warn(
      JSON.stringify({
        event: "webhook.asana.handshake_rejected",
        reason: result.reason,
      }),
    );
    // No echo → Asana fails the webhook creation. 400 (not 200) so a
    // legitimate-but-misrouted activation fails loudly instead of
    // "succeeding" with an unverifiable webhook.
    return NextResponse.json({ error: "handshake rejected" }, { status: 400 });
  }

  if (result.kind === "unknown_workflow") {
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unverifiable") {
    console.warn(
      JSON.stringify({
        event: "webhook.asana.unverifiable_row",
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "heartbeat") {
    return NextResponse.json({ ok: true, dispatched: 0, heartbeat: true });
  }

  // Dispatch each event. Failures here return 5xx so Asana retries.
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
        event: "webhook.asana.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/asana
 *
 * Service-info endpoint. Asana's handshake is the POST X-Hook-Secret
 * echo — there is no GET-time challenge. Returns a JSON description so
 * accidental GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "asana webhook",
    description:
      "POST events here. Per-webhook signature verified via X-Hook-Signature (HMAC-SHA256-hex over the raw body, keyed with the webhook's X-Hook-Secret persisted at creation-handshake time). The X-Hook-Secret handshake is echoed only during trigger activation.",
  });
}
