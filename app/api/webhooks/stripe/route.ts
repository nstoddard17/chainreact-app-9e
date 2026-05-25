import { NextResponse } from "next/server";
import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { receiveStripeWebhook } from "@/integrations/stripe/webhooks/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Stripe event_received trigger's
// activation/deactivation registrations at module load. Without it,
// the receive path's lookup would run but the lifecycle deactivate
// hook would be missing from the activation registry on a fresh
// worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/stripe
 *
 * Slice 11 plan §"Webhook trigger model" + §"Webhook receive":
 *   - Reads raw body BEFORE parsing (signature is over those bytes).
 *   - Strict-direct-lookup: requires `?workflowId=X&nodeId=Y` query
 *     params (set on the notification URL at activation time). NO
 *     multi-secret fallback over every active Stripe trigger row.
 *   - Verifies `Stripe-Signature: t=<unix>,v1=<hex>` against the
 *     stored `endpointSecret` (Stripe's `whsec_xxx`). Mismatch /
 *     missing header / malformed → 401. Stale timestamp → 401 (with
 *     `SignatureExpiredError` subclass for diagnostic logs).
 *   - Unknown workflow / node → 200 quietly (in-flight window ack —
 *     Stripe retries for up to 3 days on non-2xx, so silently
 *     200-acking dropped endpoints avoids retry storms).
 *   - Allowlist filter — events outside the Slice 11 Batch 1
 *     allowlist are 200-acked without dispatch (defense-in-depth
 *     against dashboard re-config drift).
 *   - On success → normalize Stripe event → dispatch through V2's
 *     `dispatchTriggerEvent` pipeline (`webhook_event_dedup` keyed
 *     on `event.id`).
 *
 * 5xx on dispatch failure so Stripe retries (its retry schedule is
 * exponential up to 3 days for non-2xx).
 *
 * Mirrors `app/api/webhooks/airtable/route.ts` shape.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveStripeWebhook>>;
  try {
    result = await receiveStripeWebhook(request);
  } catch (err) {
    if (err instanceof SignatureExpiredError) {
      console.warn(
        JSON.stringify({
          event: "webhook.stripe.signature_expired",
          error: (err as Error).message,
        }),
      );
      return NextResponse.json(
        { error: "signature expired" },
        { status: 401 },
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
        event: "webhook.stripe.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_workflow") {
    // Quietly ack — Stripe may still deliver events for an endpoint
    // that was just deleted (in-flight window). 200 avoids the
    // 3-day retry schedule on non-2xx.
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unsupported_event_type") {
    // Allowlist filter — defense-in-depth. 200 ack without dispatch.
    console.info(
      JSON.stringify({
        event: "webhook.stripe.unsupported_event_type",
        stripeEventType: result.stripeEventType,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch each event. Failures here return 5xx so Stripe retries.
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
        event: "webhook.stripe.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/stripe
 *
 * Service-info endpoint. Stripe's webhook system has no validation
 * handshake — there's no GET-time challenge to honor. This endpoint
 * just returns a JSON description so accidental GET requests don't
 * 404 mysteriously.
 */
export async function GET() {
  return NextResponse.json({
    service: "stripe webhook",
    description:
      "POST events here. Signature verified via Stripe-Signature (HMAC-SHA256 over `${t}.${rawBody}`).",
  });
}
