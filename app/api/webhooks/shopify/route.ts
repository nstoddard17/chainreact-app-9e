import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveShopifyWebhook } from "@/integrations/shopify/triggers/webhookReceived/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
// Side-effect import: forces the Shopify webhook_received trigger's
// activation/deactivation registrations at module load. Without it,
// the receive path's lookup would run but the lifecycle deactivate
// hook would be missing from the activation registry on a fresh
// worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/shopify
 *
 * Slice 12 Commit 4. Mirrors `app/api/webhooks/stripe/route.ts` shape.
 *
 *   - Reads raw body BEFORE parsing (signature is over those bytes —
 *     handled inside `receiveShopifyWebhook`).
 *   - Strict-direct-lookup: requires `?workflowId=X&nodeId=Y` query
 *     params (set on the notification URL at activation time). NO
 *     multi-secret fallback.
 *   - Verifies `X-Shopify-Hmac-SHA256` against the global
 *     `SHOPIFY_CLIENT_SECRET` env. Mismatch / missing header /
 *     malformed → 401.
 *   - Unknown workflow / node → 200 quiet ack (Shopify retries for
 *     up to 48 hours on non-2xx; quietly 200-acking dropped endpoints
 *     avoids retry storms during deactivation race windows).
 *   - Unsupported topic (outside the trigger's activation-time
 *     subscription set) → 200 ack without dispatch (defense-in-depth
 *     against dashboard re-config drift).
 *   - On success → normalize Shopify delivery → dispatch through V2's
 *     `dispatchTriggerEvent` pipeline (`webhook_event_dedup` keyed
 *     on the `X-Shopify-Webhook-Id` header preferred, derived
 *     fallback otherwise).
 *
 * 5xx on dispatch failure so Shopify retries.
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveShopifyWebhook>>;
  try {
    result = await receiveShopifyWebhook(request);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json(
        { error: "invalid signature" },
        { status: 401 },
      );
    }
    console.error(
      JSON.stringify({
        event: "webhook.shopify.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  if (result.kind === "unknown_workflow") {
    // Quietly ack — Shopify may still deliver events for an endpoint
    // that was just deleted (in-flight window). 200 avoids the
    // 48-hour retry schedule on non-2xx.
    return NextResponse.json({ ok: true, dispatched: 0 });
  }

  if (result.kind === "unsupported_topic") {
    // Allowlist filter — defense-in-depth. 200 ack without dispatch.
    console.info(
      JSON.stringify({
        event: "webhook.shopify.unsupported_topic",
        topic: result.topic,
      }),
    );
    return NextResponse.json({ ok: true, dispatched: 0, skipped: true });
  }

  // Dispatch each event. Failures here return 5xx so Shopify retries.
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
        event: "webhook.shopify.dispatch_error",
        error: (err as Error).message,
        eventCount: result.events.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/shopify
 *
 * Service-info endpoint. Shopify's webhook system has no validation
 * handshake — there's no GET-time challenge to honor. This endpoint
 * just returns a JSON description so accidental GET requests don't
 * 404 mysteriously.
 */
export async function GET() {
  return NextResponse.json({
    service: "shopify webhook",
    description:
      "POST events here. Signature verified via X-Shopify-Hmac-SHA256 (HMAC-SHA256-base64 over raw body, keyed with SHOPIFY_CLIENT_SECRET).",
  });
}
