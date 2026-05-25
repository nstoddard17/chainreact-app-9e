import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveTrelloWebhook,
} from "@/integrations/trello/triggers/_shared/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the 6 Trello trigger registrations at
// module load. Without it the receive path's downstream dispatch
// could find the trigger row but the deactivation hook would be
// missing on a fresh worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/trello
 *
 * Slice 17 Commit 5. Mirrors `app/api/webhooks/github/route.ts` shape.
 *
 *   - Reads raw body BEFORE parsing (signature is over those bytes +
 *     the registered callback URL — handled inside
 *     `receiveTrelloWebhook`).
 *   - Strict-direct-lookup: requires `?workflowId=X&nodeId=Y` query
 *     params (set on the notification URL at activation time).
 *   - Verifies `X-Trello-Webhook` (base64 HMAC-SHA1 over
 *     `rawBody + callbackURL`) against `TRELLO_CLIENT_SECRET`.
 *     Mismatch / missing header / malformed → 401.
 *     Missing secret env var → 503 (server misconfig — closes V1's
 *     no-op verifier gap per Slice 17 plan §"V1 bugs to fix" #1).
 *   - Unknown workflow / node → 200 quiet ack (avoids feedback loops
 *     for in-flight events to a just-deleted workflow).
 *   - Unsupported action type → 200 ack without dispatch.
 *   - Event-type mismatch (one board webhook delivers many actions;
 *     each trigger row cares about ONE event type) → 200 ack.
 *   - Board id mismatch (defense-in-depth) → 200 ack.
 *   - On success → normalize delivery → dispatch through V2's
 *     `dispatchTriggerEvent` pipeline (`webhook_event_dedup` keyed
 *     on the Trello action id).
 *
 * 5xx on dispatch failure so Trello retries.
 */
export async function POST(request: Request) {
  // Capture raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();

  let result: Awaited<ReturnType<typeof receiveTrelloWebhook>>;
  try {
    result = await receiveTrelloWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.trello.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "Trello webhook secret is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.trello.receive_error",
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

  if (result.kind === "unsupported_event") {
    console.info(
      JSON.stringify({
        event: "webhook.trello.unsupported_event",
        actionType: result.actionType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "event_type_mismatch") {
    console.info(
      JSON.stringify({
        event: "webhook.trello.event_type_mismatch",
        triggerEventType: result.triggerEventType,
        inboundEventType: result.inboundEventType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  if (result.kind === "board_mismatch") {
    console.info(
      JSON.stringify({
        event: "webhook.trello.board_mismatch",
        expected: result.expected,
        received: result.received,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch each event. Failures here return 5xx so Trello retries.
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
        event: "webhook.trello.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * HEAD /api/webhooks/trello
 *
 * Trello's webhook-registration HTTP-verb probe. When a webhook is
 * created via `POST /1/webhooks`, Trello issues a HEAD request to the
 * `callbackURL`; the URL MUST respond 200 for the webhook to be
 * accepted. NO signature verification is required for this probe —
 * Trello sends no body and no signature header on the HEAD.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

/**
 * GET /api/webhooks/trello
 *
 * Service-info endpoint. Returns a JSON description so accidental
 * GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "trello webhook",
    description:
      "POST events here. Signature verified via X-Trello-Webhook (HMAC-SHA1-base64 over rawBody + callbackURL, keyed with TRELLO_CLIENT_SECRET).",
  });
}
