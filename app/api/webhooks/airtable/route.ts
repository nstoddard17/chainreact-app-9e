import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveAirtableWebhook } from "@/integrations/airtable/webhooks/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Airtable record_changed trigger's
// activation/deactivation/subscription registrations at module load.
// Without it, the receive path's lookup would run but the renewal
// cron and lifecycle deactivate hook would be missing.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/airtable
 *
 * Slice 10 plan §"Webhook receive":
 *   - Reads raw body BEFORE parsing (signature is over those bytes).
 *   - Parses ping body `{ base: { id }, webhook: { id }, timestamp }`.
 *   - Looks up trigger row by `webhook.id`.
 *   - Verifies `X-Airtable-Content-MAC: hmac-sha256=<hex>` against
 *     stored `macSecretBase64` via constant-time HMAC compare.
 *   - Mismatch / missing header / malformed body → 401.
 *   - Unknown webhookId → 200 (quietly accept; in-flight window after
 *     deactivate).
 *   - On success → fetch payloads via cursor, advance cursor BEFORE
 *     returning, normalize, dispatch each event through V2's
 *     dispatch + dedup pipeline.
 *
 * 5xx on dispatch failure so Airtable retries.
 *
 * Mirrors `app/api/webhooks/microsoft-onedrive/route.ts` shape.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveAirtableWebhook>>;
  try {
    result = await receiveAirtableWebhook(request);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.airtable.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_webhook") {
    // Quietly ack — Airtable may still deliver pings for a webhook
    // that was deleted (in-flight window). 200 avoids noisy retries.
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  // Dispatch each event. Failures here return 5xx so Airtable retries.
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
        event: "webhook.airtable.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/airtable
 *
 * Service-info endpoint. Airtable's webhook system has no validation
 * handshake — there's no GET-time challenge to honor. This endpoint
 * just returns a JSON description so accidental GET requests don't
 * 404 mysteriously.
 */
export async function GET() {
  return NextResponse.json({
    service: "airtable webhook",
    description:
      "POST notifications here. Signature verified via X-Airtable-Content-MAC.",
  });
}
