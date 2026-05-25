import { NextResponse } from "next/server";
import { receiveMailchimpWebhook } from "@/integrations/mailchimp/triggers/audienceEvent/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Mailchimp audience_event trigger's
// activation/deactivation registrations at module load. Without it,
// the receive path's lookup would run but the lifecycle deactivate
// hook would be missing from the activation registry on a fresh
// worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/mailchimp
 *
 * Slice 14 Commit 4. Mirrors `app/api/webhooks/shopify/route.ts` shape
 * with Mailchimp-specific quirks:
 *
 *   - **No signature.** Mailchimp doesn't sign webhook deliveries.
 *     Authenticity relies on URL secrecy (?workflowId=X&nodeId=Y),
 *     audience id match, event-type allowlist, and sha256(rawBody)
 *     dedup. See `_shared/mailchimp/webhooks/signature.ts`.
 *   - **Form-encoded body.** Mailchimp POSTs
 *     `application/x-www-form-urlencoded` (NOT JSON). The receive
 *     helper parses it via `URLSearchParams` and unwraps bracket-
 *     notation keys (`data[email]`, `data[merges][FNAME]`).
 *   - **Raw body BEFORE parse.** The dedup key is sha256 of the raw
 *     body — we capture `request.text()` once and pass it to the
 *     receive helper.
 *   - **Unknown / mismatch outcomes 200-ack** so Mailchimp doesn't
 *     loop retries on intentionally-dropped events.
 *
 * 5xx on dispatch failure so Mailchimp retries.
 */
export async function POST(request: Request) {
  // Read raw body BEFORE any other request operation. Mailchimp's
  // dedup key is sha256(rawBody) — re-reading the body via
  // `.formData()` would mutate the request and break the hash.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.mailchimp.body_read_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Could not read request body." },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof receiveMailchimpWebhook>>;
  try {
    result = await receiveMailchimpWebhook({ url: request.url, rawBody });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.mailchimp.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_workflow") {
    // Quietly ack — in-flight delivery for a deleted workflow, or an
    // attacker probing the endpoint without valid query params.
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "audience_mismatch") {
    // The URL points at a real workflow but the inbound event is for
    // a different audience. Defense-in-depth — 200 ack so we don't
    // signal "no such endpoint" to the wrong audience's owner.
    console.info(
      JSON.stringify({
        event: "webhook.mailchimp.audience_mismatch",
        expected: result.expected,
        received: result.received,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "unsupported_event_type") {
    // Trigger exists but the event type isn't in the workflow's
    // activation-time selection (or isn't in the global allowlist).
    // 200 ack — Mailchimp might be delivering an event the user
    // de-selected since activation.
    console.info(
      JSON.stringify({
        event: "webhook.mailchimp.unsupported_event_type",
        receivedType: result.receivedType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch — dispatchTriggerEvent runs dedup (sha256 hash IS the
  // eventId) + workflow-state gating + enqueue. 5xx on failure so
  // Mailchimp retries the delivery.
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
        event: "webhook.mailchimp.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/mailchimp
 *
 * Mailchimp webhook handshake. Immediately after webhook create,
 * Mailchimp issues a GET to the callback URL — the response must be
 * 2xx (Mailchimp considers the webhook valid) or the webhook is
 * rejected at create time. Returns a minimal JSON body for
 * diagnostic clarity; the status code is what Mailchimp checks.
 */
export async function GET() {
  return NextResponse.json({
    service: "mailchimp webhook",
    description:
      "POST events here. Mailchimp does not sign webhooks; authentication relies on URL secrecy (workflowId/nodeId), audienceId match, event-type allowlist, and sha256(rawBody) dedup.",
  });
}
