import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveMondayWebhook,
} from "@/integrations/monday/triggers/_shared/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the 5 Monday trigger registrations at module
// load. Without it the receive path's strict lookup would resolve the
// trigger row but the deactivation hook would be missing from the
// registry on a fresh worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/monday
 *
 * Slice 3.MONDAY-7. Single route for all 5 Monday webhook triggers
 * (`new_item`, `column_changed`, `item_moved`, `new_subitem`,
 * `new_update`). Mirrors `app/api/webhooks/github` / `trello` shape.
 *
 *   - Reads the raw body BEFORE parsing — the HMAC is over those bytes.
 *   - **Challenge handshake**: Monday POSTs `{ challenge }` on
 *     `create_webhook` to verify endpoint ownership. The receive helper
 *     echoes it back (BEFORE signature verification — the token carries
 *     no event data and gating it would risk breaking webhook creation).
 *   - Verifies `x-monday-signature` (HMAC-SHA256 hex over the raw body,
 *     keyed with `MONDAY_SIGNING_SECRET`) for real events. Mismatch /
 *     missing header / malformed → 401. Missing secret env → 503 (server
 *     misconfig — V1 silently SKIPPED verification when unset).
 *   - Strict-direct-lookup via `?workflowId=X&nodeId=Y` (set at
 *     activation time). Missing params / unknown row → 200 quiet ack.
 *   - Unsupported inbound event type → 200 ack. Event-type vs trigger-row
 *     mismatch → 200 ack.
 *   - On success → normalize → dispatch through V2's
 *     `dispatchTriggerEvent` (`webhook_event_dedup` keyed on the
 *     deterministic per-event id).
 *
 * 5xx on dispatch failure so Monday retries.
 */
export async function POST(request: Request) {
  // Capture raw body BEFORE parse — the signature is over these bytes.
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveMondayWebhook>>;
  try {
    result = await receiveMondayWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.monday.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "Monday webhook secret is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.monday.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "challenge") {
    // Monday's webhook-creation handshake — echo the challenge token.
    return NextResponse.json({ challenge: result.challenge });
  }

  if (result.kind === "unknown_workflow") {
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unsupported_event") {
    console.info(
      JSON.stringify({
        event: "webhook.monday.unsupported_event",
        eventType: result.eventType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "event_type_mismatch") {
    console.info(
      JSON.stringify({
        event: "webhook.monday.event_type_mismatch",
        triggerEventType: result.triggerEventType,
        inboundType: result.inboundType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch each event. Failures here return 5xx so Monday retries.
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
        event: "webhook.monday.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/monday
 *
 * Service-info endpoint. Monday's webhook handshake is the POST
 * `{ challenge }` echo — there is no GET-time challenge. Returns a JSON
 * description so accidental GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "monday webhook",
    description:
      "POST events here. Signature verified via x-monday-signature (HMAC-SHA256-hex over the raw body, keyed with MONDAY_SIGNING_SECRET). Monday's create_webhook { challenge } handshake is echoed.",
  });
}
