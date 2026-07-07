/**
 * Trigger-smoke — stripe:event_received pure spec (Lane C direct-seed, on the
 * generic orchestrator in directSeedWebhookSmoke.ts).
 *
 * Stripe's endpoint signing secret is PER TRIGGER ROW (`config.endpointSecret`,
 * Stripe's `whsec_xxx` model) — so the smoke MINTS its own secret, seeds it on
 * the direct-seeded trigger_resources row, and signs the synthetic event with
 * that same secret. Production verification (`Stripe-Signature: t=<unix>,v1=<hex
 * HMAC-SHA256("${t}.${rawBody}")>` with the 300s replay window) runs UNCHANGED
 * and UNWEAKENED — no env secret is required at all.
 *
 * The synthetic event is an allowlisted `checkout.session.completed` whose
 * resource snapshot carries ONLY smoke-minted ids (`evt_crsmoke…` /
 * `cs_crsmoke…`) — no amounts-of-record, no customer PII, no real Stripe object.
 * `normalize` emits eventType `event_received` with `payload.stripeEventType`
 * as the discriminator; dedup keys on `event.id` via dispatchTriggerEvent.
 *
 * HONEST SCOPE: V2 ingestion-path cert for the Stripe event shape (route →
 * per-row-secret signature verify → allowlist → normalize → dispatch → dedup →
 * enqueue → terminal run). Does NOT certify Stripe provider-side endpoint
 * activation, and does NOT claim Stripe delivered the event.
 */
import { createHmac } from "node:crypto";
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export const STRIPE_EVENT_RECEIVED_EVENT_TYPE = "event_received";
/** Allowlisted Stripe event type the synthetic event uses. */
export const STRIPE_SMOKE_EVENT_TYPE = "checkout.session.completed";

export interface StripeWebhookSmokeIdentity extends DirectSeedSmokeIdentity {
  /** Stripe `evt_xxx` — TriggerEvent.eventId + the dedup key. Carries the marker. */
  readonly eventId: string;
  /** Smoke-minted per-row endpoint signing secret (whsec-style). */
  readonly endpointSecret: string;
  /** Synthetic checkout-session id — the payload marker. */
  readonly objectId: string;
  /** Unix seconds stamped on the synthetic event. */
  readonly createdUnix: number;
}

/** The synthetic Stripe event JSON body (raw bytes the signature covers). */
export function buildStripeSmokeBody(identity: StripeWebhookSmokeIdentity): string {
  return JSON.stringify({
    id: identity.eventId,
    object: "event",
    type: STRIPE_SMOKE_EVENT_TYPE,
    api_version: "2025-05-28.basil",
    created: identity.createdUnix,
    livemode: false,
    data: {
      object: {
        id: identity.objectId,
        object: "checkout.session",
        metadata: { crsmoke: "trigger-smoke synthetic event" },
      },
    },
    request: { id: null, idempotency_key: null },
  });
}

/** Stripe's documented signature: `t=<unix>,v1=<hex HMAC-SHA256("${t}.${rawBody}")>`. */
export function signStripeSmokeBody(
  timestampSeconds: number,
  rawBody: string,
  endpointSecret: string,
): string {
  const hex = createHmac("sha256", endpointSecret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${hex}`;
}

export const STRIPE_EVENT_RECEIVED_SPEC: DirectSeedWebhookSpec<StripeWebhookSmokeIdentity> = {
  label: "stripe:event_received",
  provider: "stripe",
  expectedEventType: STRIPE_EVENT_RECEIVED_EVENT_TYPE,
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "stripe",
      STRIPE_EVENT_RECEIVED_EVENT_TYPE,
      // `enabledEvents` is the meta's REQUIRED builder field (readiness gate).
      // The receive route reads only config.endpointSecret + the global
      // allowlist; per-event narrowing is Stripe-side (endpoint enabled_events).
      { enabledEvents: [STRIPE_SMOKE_EVENT_TYPE] },
      "stripe:event_received",
    ),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== STRIPE_EVENT_RECEIVED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.stripeEventType !== STRIPE_SMOKE_EVENT_TYPE) return false;
    const data = payload.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== "object") return false;
    // Marker proof: the normalized payload preserves the smoke-minted
    // checkout-session id verbatim (crsmoke marker rides in the id).
    return data.id === identity.objectId;
  },
};
