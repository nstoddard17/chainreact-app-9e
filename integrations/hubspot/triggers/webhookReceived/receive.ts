import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { verifyHubSpotSignature } from "@/integrations/_shared/hubspot/webhooks/signature";
import * as appSubsRepo from "@/repositories/hubspotAppSubscriptions";
import * as refsRepo from "@/repositories/hubspotSubscriptionRefs";
import {
  isPropertyChangeSubscriptionType,
} from "./allowedSubscriptionTypes";
import {
  normalizeHubSpotEvent,
  type HubSpotWebhookEvent,
} from "./normalize";

/**
 * Verify and parse an inbound HubSpot webhook delivery — Slice 13 Commit 5.
 *
 * **App-level multi-tenant routing** (distinct from every prior V2 webhook
 * provider — Stripe/Shopify use strict-direct-lookup by URL query
 * params, Airtable/Microsoft use per-subscription registration):
 *   - HubSpot Public Apps post EVERY event from EVERY portal to a single
 *     global URL (configured in the developer-portal app settings). The
 *     receive route must route by the `portalId` field in each event
 *     payload, NOT by the URL.
 *   - The wire body is an ARRAY of events — one POST may carry events
 *     from multiple subscriptions for the same portal, batched by
 *     HubSpot for throughput.
 *
 * Signature verification (closes V1's open security gap):
 *   - Verifies `X-HubSpot-Signature-V3` + `X-HubSpot-Request-Timestamp`
 *     against `HUBSPOT_CLIENT_SECRET`. Canonical request string is
 *     `${method}${requestUri}${rawBody}${timestamp}` (HubSpot V3 docs).
 *   - 5-minute replay tolerance.
 *   - Constant-time compare via `crypto.timingSafeEqual`.
 *
 * Routing for each event:
 *   1. Look up the `hubspot_app_subscriptions` row by
 *      `(appId=HUBSPOT_APP_ID, eventType=subscriptionType, propertyName?)`.
 *      No row → `skipReason: "unknown_subscription"` (200 quiet ack, log).
 *      This happens when:
 *        * The dashboard subscribed an event type V2 doesn't have a
 *          DB mirror for (defense-in-depth against out-of-band drift).
 *        * The lifecycle removed the V2 row but HubSpot didn't yet
 *          process the DELETE.
 *   2. Find refs by `(app_subscription_id, hub_id=portalId)`. No refs →
 *      `skipReason: "no_matching_refs"` (200 quiet ack, log). Common
 *      cause: an event from a portal that NO V2 workflow subscribes to
 *      (other tenants of the same Public App).
 *   3. Each matching ref becomes a dispatch target. The route's
 *      dispatcher dedups once per event (eventId), then enqueues a
 *      workflow run per target.
 *
 * Outcomes:
 *   - `events`: signature OK + payload parsed. `deliveries[]` may
 *     contain zero or more dispatch-ready entries. Empty array = all
 *     events filtered out (still a 200 success).
 *
 * Throws (route maps to 401):
 *   - `SignatureExpiredError` — timestamp outside the 5-minute
 *     tolerance window (subclass of InvalidSignatureError).
 *   - `InvalidSignatureError` — missing header / missing timestamp /
 *     malformed timestamp / signature mismatch / missing
 *     `HUBSPOT_CLIENT_SECRET` env / empty body / body not JSON.
 *
 * Throws (route maps to 500):
 *   - Any unexpected error from repo lookup.
 */

export interface DispatchTarget {
  workflowId: string;
  nodeId: string;
  userId: string;
}

export interface DispatchDelivery {
  event: TriggerEvent;
  targets: ReadonlyArray<DispatchTarget>;
  /**
   * When set, the route MUST 200-ack without dedup + enqueue. `null`
   * means the event is ready for dispatch.
   */
  skipReason: "unknown_subscription" | "no_matching_refs" | null;
  /** Stash for diagnostic logs. */
  subscriptionType: string;
  portalId: string;
}

export type ReceiveResult =
  | { kind: "events"; deliveries: ReadonlyArray<DispatchDelivery> };

const SIGNATURE_HEADER = "x-hubspot-signature-v3";
const TIMESTAMP_HEADER = "x-hubspot-request-timestamp";

interface ReceiveOptions {
  /**
   * Override `process.env.HUBSPOT_CLIENT_SECRET` (test seam). Production
   * callers omit this and we read the env.
   */
  secret?: string;
  /**
   * Override `process.env.HUBSPOT_APP_ID` (test seam).
   */
  appId?: string;
  /**
   * Override `process.env.HUBSPOT_WEBHOOK_URL` / NEXT_PUBLIC_APP_URL +
   * path. Tests override to drive the canonical-URL builder
   * deterministically.
   */
  requestUriOverride?: string;
  /** Inject `now` (epoch ms) for deterministic signature tests. */
  nowMs?: number;
}

function getSecret(opts: ReceiveOptions): string {
  const secret = opts.secret ?? process.env.HUBSPOT_CLIENT_SECRET;
  if (!secret) {
    // Throw a typed InvalidSignatureError so the route maps to 401
    // (vs silently 500'ing). A missing env in production is a deploy
    // misconfiguration; from the caller's perspective it's
    // indistinguishable from "your signature didn't match."
    throw new InvalidSignatureError(
      "HubSpot webhook: HUBSPOT_CLIENT_SECRET env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
  }
  return secret;
}

function getAppId(opts: ReceiveOptions): string | null {
  const appId = opts.appId ?? process.env.HUBSPOT_APP_ID;
  return appId && appId.length > 0 ? appId : null;
}

/**
 * Build the canonical request URI HubSpot signed against. HubSpot signs
 * with the EXACT URL configured in the developer-portal app settings,
 * so we cannot trust Next.js's `request.url` (the host may be rewritten
 * by middleware / proxies). Resolution order:
 *   1. `opts.requestUriOverride` — test seam.
 *   2. `HUBSPOT_WEBHOOK_URL` env — explicit operator override.
 *   3. `NEXT_PUBLIC_APP_URL` + `/api/webhooks/hubspot` — default
 *      derivation. Trailing slash normalized.
 */
function getCanonicalRequestUri(opts: ReceiveOptions): string {
  if (opts.requestUriOverride) return opts.requestUriOverride;
  const explicit = process.env.HUBSPOT_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/webhooks/hubspot`;
}

export async function receiveHubSpotWebhook(
  request: Request,
  options: ReceiveOptions = {},
): Promise<ReceiveResult> {
  // 1. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    throw new InvalidSignatureError("HubSpot webhook: empty body.");
  }

  // 2. Verify signature. We surface specific failure reasons as
  //    distinct error types for diagnostic logging — both map to 401.
  const secret = getSecret(options);
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const timestampHeader = request.headers.get(TIMESTAMP_HEADER);
  const verifyResult = verifyHubSpotSignature({
    method: request.method,
    requestUri: getCanonicalRequestUri(options),
    rawBody,
    signatureHeader,
    timestampHeader,
    secret,
    nowMs: options.nowMs,
  });
  if (!verifyResult.valid) {
    if (verifyResult.reason === "expired") {
      throw new SignatureExpiredError(
        "HubSpot webhook: signature timestamp outside the 5-minute replay tolerance window.",
      );
    }
    throw new InvalidSignatureError(
      `HubSpot webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 3. Parse JSON body. HubSpot always sends a well-formed JSON array
  //    on signature-verified deliveries; a parse error after a verified
  //    signature means upstream re-encoded the body — fail loud.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidSignatureError(
      "HubSpot webhook: body is not valid JSON despite a verified signature.",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidSignatureError(
      "HubSpot webhook: body is not a JSON array.",
    );
  }
  const events = parsed as ReadonlyArray<HubSpotWebhookEvent>;

  // 4. Resolve app id. If missing, we can't look up app subscriptions
  //    — the entire delivery is unroutable. Return a single delivery
  //    marker so the route logs it and returns 200 (the alternative is
  //    failing 500 and triggering HubSpot's 10x-over-72h retry, which
  //    would re-trigger the same env failure). The deploy is broken;
  //    log loudly but ack.
  const appId = getAppId(options);

  const deliveries: DispatchDelivery[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object" || !event.subscriptionType) {
      // Malformed event item — skip silently. HubSpot wouldn't have
      // signed it if it weren't well-formed, but defense-in-depth
      // against future schema additions that aren't backward-compat.
      continue;
    }
    const portalId =
      event.portalId !== undefined && event.portalId !== null
        ? String(event.portalId)
        : "";
    if (!portalId) continue;

    const normalized = normalizeHubSpotEvent(event);

    // App-level subscription lookup. `propertyName` is null for
    // non-propertyChange events; matches the unique-index COALESCE
    // semantics.
    const lookupPropertyName = isPropertyChangeSubscriptionType(
      event.subscriptionType,
    )
      ? event.propertyName ?? null
      : null;

    if (!appId) {
      deliveries.push({
        event: normalized,
        targets: [],
        skipReason: "unknown_subscription",
        subscriptionType: event.subscriptionType,
        portalId,
      });
      continue;
    }

    const appSub = await appSubsRepo.find({
      appId,
      eventType: event.subscriptionType,
      propertyName: lookupPropertyName,
    });
    if (!appSub) {
      deliveries.push({
        event: normalized,
        targets: [],
        skipReason: "unknown_subscription",
        subscriptionType: event.subscriptionType,
        portalId,
      });
      continue;
    }

    // Portal-scoped ref lookup — the active refs for THIS portal.
    const refs = await refsRepo.listForDispatch({
      appSubscriptionId: appSub.id,
      hubId: portalId,
    });
    if (refs.length === 0) {
      deliveries.push({
        event: normalized,
        targets: [],
        skipReason: "no_matching_refs",
        subscriptionType: event.subscriptionType,
        portalId,
      });
      continue;
    }

    const targets: DispatchTarget[] = refs.map((r) => ({
      workflowId: r.workflowId,
      nodeId: r.nodeId,
      userId: r.userId,
    }));
    deliveries.push({
      event: normalized,
      targets,
      skipReason: null,
      subscriptionType: event.subscriptionType,
      portalId,
    });
  }

  return { kind: "events", deliveries };
}
