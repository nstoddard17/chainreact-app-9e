/**
 * Trigger-smoke — hubspot:webhook_received pure spec (Lane C direct-seed, on the
 * generic orchestrator in directSeedWebhookSmoke.ts).
 *
 * HubSpot is the one provider in this batch whose registration does NOT live in
 * trigger_resources: the receive route routes app-level deliveries by the
 * `portalId` field in each event to `hubspot_app_subscriptions` (per appId +
 * eventType) → `hubspot_subscription_refs` (per portal + workflow node). The
 * deps direct-seed BOTH rows (smoke-minted portal id; the REAL env
 * `HUBSPOT_APP_ID` so the route's app lookup matches) — no HubSpot API call, no
 * real app-level subscription created.
 *
 * Signature: `X-HubSpot-Signature-V3` = base64 HMAC-SHA256 over the canonical
 * string `${method}${requestUri}${rawBody}${timestampMs}` keyed with the REAL
 * `HUBSPOT_CLIENT_SECRET`, plus `X-HubSpot-Request-Timestamp` (5-minute replay
 * window). The requestUri MUST mirror the route's canonical-URL resolution
 * (`HUBSPOT_WEBHOOK_URL` env, else `NEXT_PUBLIC_APP_URL` +
 * `/api/webhooks/hubspot`) — production verification runs UNCHANGED.
 *
 * The synthetic delivery is a one-event array of an allowlisted
 * `contact.creation` carrying ONLY smoke-minted ids (`crsmoke` event id /
 * portal id / object id) — no contact properties, no PII, no real portal.
 *
 * HONEST SCOPE: V2 ingestion-path cert for the HubSpot event shape (route →
 * V3 signature verify → app-subscription + portal-ref routing → route-level
 * dedup (markSeen) → per-ref enqueue → terminal run). NOTE: HubSpot's route
 * dedups + enqueues per matched ref DIRECTLY (the shared-subscription model) —
 * it does not go through dispatchTriggerEvent like the trigger_resources
 * providers. Does NOT certify HubSpot provider-side subscription activation,
 * and does NOT claim HubSpot delivered the event.
 */
import { createHmac } from "node:crypto";
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export const HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE = "webhook_received";
/** Allowlisted HubSpot subscription type the synthetic event uses. */
export const HUBSPOT_SMOKE_SUBSCRIPTION_TYPE = "contact.creation";

export interface HubSpotWebhookSmokeIdentity extends DirectSeedSmokeIdentity {
  /** HubSpot `eventId` — TriggerEvent.eventId + the route dedup key. Marker. */
  readonly eventId: string;
  /** Synthetic portal (hub) id the route routes by. */
  readonly portalId: string;
  /** Synthetic CRM object id — the payload marker. */
  readonly objectId: string;
  /** Synthetic hubspot subscription id stamped on the seeded app-sub row. */
  readonly hubspotSubscriptionId: string;
  /** Unix millis stamped on the synthetic event. */
  readonly occurredAtMs: number;
}

/** The synthetic HubSpot delivery: a one-event JSON ARRAY (the wire format). */
export function buildHubSpotSmokeBody(
  identity: HubSpotWebhookSmokeIdentity,
  appId: string,
): string {
  return JSON.stringify([
    {
      eventId: identity.eventId,
      subscriptionId: identity.hubspotSubscriptionId,
      portalId: identity.portalId,
      appId,
      occurredAt: identity.occurredAtMs,
      subscriptionType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE,
      attemptNumber: 0,
      objectId: identity.objectId,
    },
  ]);
}

/**
 * HubSpot's documented V3 signature: base64 HMAC-SHA256 over
 * `${method}${requestUri}${rawBody}${timestampMs}` (no separators).
 */
export function signHubSpotSmokeRequest(input: {
  method: string;
  requestUri: string;
  rawBody: string;
  timestampMs: number;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.method}${input.requestUri}${input.rawBody}${input.timestampMs}`)
    .digest("base64");
}

/**
 * Mirror of the receive route's canonical-URL resolution
 * (`getCanonicalRequestUri` in
 * integrations/hubspot/triggers/webhookReceived/receive.ts) — the smoke MUST
 * sign the exact URI the route will verify against.
 */
export function hubspotSmokeCanonicalRequestUri(): string {
  const explicit = process.env.HUBSPOT_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/webhooks/hubspot`;
}

export const HUBSPOT_WEBHOOK_RECEIVED_SPEC: DirectSeedWebhookSpec<HubSpotWebhookSmokeIdentity> = {
  label: "hubspot:webhook_received",
  provider: "hubspot",
  expectedEventType: HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE,
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "hubspot",
      HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE,
      // `subscriptions` is the meta's REQUIRED builder field (readiness gate).
      // contact.creation takes NO propertyName (only *.propertyChange does).
      { subscriptions: [{ eventType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE }] },
      "hubspot:webhook_received",
    ),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== HUBSPOT_WEBHOOK_RECEIVED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.subscriptionType !== HUBSPOT_SMOKE_SUBSCRIPTION_TYPE) {
      return false;
    }
    if (payload.portalId !== identity.portalId) return false;
    // Marker proof: the normalized payload preserves the smoke-minted CRM
    // object id verbatim (crsmoke marker rides in the id).
    return payload.objectId === identity.objectId;
  },
};
