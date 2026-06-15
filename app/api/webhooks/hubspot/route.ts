import { NextResponse } from "next/server";
import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { receiveHubSpotWebhook } from "@/integrations/hubspot/triggers/webhookReceived/receive";
import * as dedup from "@/repositories/webhookEventDedup";
import { getDispatchInfo } from "@/repositories/workflows";
import { enqueueRun } from "@/services/execution/enqueue";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
// Side-effect import: forces the HubSpot webhook_received trigger's
// activation/deactivation registrations at module load. Without it,
// the receive path's lookup would run but the lifecycle deactivate
// hook would be missing from the activation registry on a fresh
// worker process.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/hubspot
 *
 * Slice 13 Commit 5. Mirrors `app/api/webhooks/stripe/route.ts` shape
 * with a HubSpot-specific dispatch loop that routes via the shared-
 * subscription model (`hubspot_app_subscriptions` +
 * `hubspot_subscription_refs`) instead of `trigger_resources`.
 *
 *   - Reads raw body BEFORE parsing (signature is over those bytes —
 *     handled inside `receiveHubSpotWebhook`).
 *   - **No `?workflowId=&nodeId=` query params.** HubSpot Public Apps
 *     post EVERY event from EVERY portal to ONE global URL configured
 *     in the developer-portal app settings. Routing is by the `portalId`
 *     field in each event payload (per HubSpot V3 docs).
 *   - Verifies `X-HubSpot-Signature-V3` + `X-HubSpot-Request-Timestamp`
 *     against `HUBSPOT_CLIENT_SECRET`. Canonical request string is
 *     `${method}${requestUri}${rawBody}${timestamp}` with 5-minute
 *     replay tolerance. Mismatch / missing header / missing timestamp /
 *     stale timestamp → 401.
 *   - **V1 has ZERO signature verification** — V2 closes a real
 *     security gap. See V1's
 *     [`app/api/webhooks/hubspot/route.ts:62`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts#L62).
 *   - Body is a JSON ARRAY of events. For each event:
 *     1. Look up `hubspot_app_subscriptions` by `(appId, eventType,
 *        propertyName?)`. No row → 200 quiet ack, log
 *        `unknown_subscription`.
 *     2. Find refs by `(app_subscription_id, hub_id=portalId)`. No
 *        refs → 200 quiet ack, log `no_matching_refs`.
 *     3. For each ref, dedup once per `eventId` then enqueue a
 *        workflow run (state-gated to `active`).
 *
 * 5xx on unexpected dispatch failure so HubSpot retries (its retry
 * schedule is up to 10x over 72h on non-2xx).
 */
export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveHubSpotWebhook>>;
  try {
    result = await receiveHubSpotWebhook(request);
  } catch (err) {
    if (err instanceof SignatureExpiredError) {
      console.warn(
        JSON.stringify({
          event: "webhook.hubspot.signature_expired",
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
        event: "webhook.hubspot.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  // Dispatch loop. We dedup per event globally (one dedup row per
  // eventId across all workflows). Failures here return 5xx so HubSpot
  // retries.
  try {
    let dispatched = 0;
    let skipped = 0;
    let duplicates = 0;
    for (const delivery of result.deliveries) {
      if (delivery.skipReason) {
        skipped += 1;
        console.info(
          JSON.stringify({
            event: `webhook.hubspot.${delivery.skipReason}`,
            subscriptionType: delivery.subscriptionType,
            portalId: delivery.portalId,
            eventId: delivery.event.eventId,
          }),
        );
        continue;
      }

      // Global dedup per (provider, eventId). Same fail-open policy as
      // `services/triggers/dispatch.ts` — Q4 session-side-effects
      // idempotency catches duplicate side effects further down the
      // chain when dedup is unavailable.
      let fresh = true;
      try {
        const r = await dedup.markSeen("hubspot", delivery.event.eventId);
        fresh = r.fresh;
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "webhook.dedup.outage",
            provider: "hubspot",
            eventId: delivery.event.eventId,
            error: (err as Error).message,
          }),
        );
      }
      if (!fresh) {
        duplicates += 1;
        console.debug(
          JSON.stringify({
            event: "webhook.dedup.duplicate",
            provider: "hubspot",
            eventId: delivery.event.eventId,
          }),
        );
        continue;
      }

      // For each target ref, state-gate + freeze-gate, then enqueue.
      for (const target of delivery.targets) {
        // getDispatchInfo returns (state, accountId) in one round trip — the
        // account id powers the V2-READY-36 freeze gate below. (Was
        // getStateForDispatch, state-only.)
        const info = await getDispatchInfo(target.workflowId);
        if (!info || info.state !== "active") {
          console.debug(
            JSON.stringify({
              event: "webhook.dispatch.dropped_inactive",
              workflowId: target.workflowId,
              state: info?.state ?? null,
              provider: "hubspot",
              eventType: delivery.event.eventType,
            }),
          );
          continue;
        }

        // V2-READY-36 — drop the event when the owning account is frozen /
        // pending-deletion (non-operational during the grace window), even though
        // the workflow is active. Mirrors the V2-READY-34 dispatch gate; the
        // engine's billing gate is the authoritative execution chokepoint, this
        // avoids creating a phantom blocked run. The event was deduped above, so a
        // HubSpot redelivery is dropped at dedup — no retry storm. Returns 200
        // (skip), never a 5xx, so HubSpot does not retry. Logged WITHOUT the
        // account id / provider payload (no leak).
        if (await isAccountFrozen(info.accountId)) {
          console.debug(
            JSON.stringify({
              event: "webhook.dispatch.dropped_frozen_account",
              workflowId: target.workflowId,
              provider: "hubspot",
              eventType: delivery.event.eventType,
            }),
          );
          continue;
        }

        await enqueueRun({
          workflowId: target.workflowId,
          triggerNodeId: target.nodeId,
          event: delivery.event,
        });
        dispatched += 1;
      }
    }
    return NextResponse.json({ ok: true, dispatched, skipped, duplicates });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.hubspot.dispatch_error",
        error: (err as Error).message,
        deliveryCount: result.deliveries.length,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/hubspot
 *
 * Service-info endpoint. HubSpot has no validation handshake — there's
 * no GET-time challenge to honor. This endpoint just returns a JSON
 * description so accidental GET requests don't 404 mysteriously.
 */
export async function GET() {
  return NextResponse.json({
    service: "hubspot webhook",
    description:
      "POST events here. Signature verified via X-HubSpot-Signature-V3 (base64 HMAC-SHA256 over `${method}${requestUri}${rawBody}${timestamp}`).",
  });
}
