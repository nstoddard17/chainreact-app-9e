/**
 * Trigger-smoke — shopify:webhook_received pure spec (Lane C direct-seed, on the
 * generic orchestrator in directSeedWebhookSmoke.ts).
 *
 * Shopify signs the RAW BODY with the single global app secret
 * (`X-Shopify-Hmac-SHA256: <base64 HMAC-SHA256>`, keyed `SHOPIFY_CLIENT_SECRET`;
 * no timestamp / replay window — dedup rides on the per-delivery
 * `X-Shopify-Webhook-Id` header). The smoke signs with the REAL env secret so
 * production verification runs UNCHANGED and UNWEAKENED.
 *
 * The synthetic delivery is an allowlisted `orders/create` whose resource
 * snapshot carries ONLY smoke-minted ids and a `crsmoke` order name — no
 * customer PII, no line items, no amounts-of-record, no real shop/order.
 * `normalize` emits eventType `webhook_received` with `payload.topic` as the
 * discriminator and forwards the body verbatim under `payload.body`.
 *
 * HONEST SCOPE: V2 ingestion-path cert for the Shopify event shape (route →
 * strict-direct-lookup by ?workflowId&nodeId → HMAC verify → per-row topic
 * allowlist → normalize → dispatch → dedup → enqueue → terminal run). Does NOT
 * certify Shopify provider-side webhook activation, and does NOT claim Shopify
 * delivered the event.
 */
import { createHmac } from "node:crypto";
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export const SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE = "webhook_received";
/** Allowlisted Shopify topic the synthetic delivery uses. */
export const SHOPIFY_SMOKE_TOPIC = "orders/create";

export interface ShopifyWebhookSmokeIdentity extends DirectSeedSmokeIdentity {
  /** `X-Shopify-Webhook-Id` — TriggerEvent.eventId + the dedup key. */
  readonly eventId: string;
  /** Synthetic shop domain (never a real shop). */
  readonly shopDomain: string;
  /** Synthetic numeric order id. */
  readonly orderId: number;
  /** Synthetic order name — carries the crsmoke marker. */
  readonly orderName: string;
  /** ISO timestamp stamped on the delivery + body. */
  readonly triggeredAt: string;
}

/** The synthetic Shopify order snapshot (raw bytes the signature covers). */
export function buildShopifySmokeBody(identity: ShopifyWebhookSmokeIdentity): string {
  return JSON.stringify({
    id: identity.orderId,
    name: identity.orderName,
    created_at: identity.triggeredAt,
    updated_at: identity.triggeredAt,
    test: true,
    currency: "USD",
    note: "crsmoke trigger-smoke synthetic order",
  });
}

/** Shopify's documented signature: base64 HMAC-SHA256 over the raw body. */
export function signShopifySmokeBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

export const SHOPIFY_WEBHOOK_RECEIVED_SPEC: DirectSeedWebhookSpec<ShopifyWebhookSmokeIdentity> = {
  label: "shopify:webhook_received",
  provider: "shopify",
  expectedEventType: SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE,
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "shopify",
      SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE,
      // `topics` is the meta's REQUIRED builder field AND what the receive
      // route reads from the seeded row to allowlist the inbound topic.
      { topics: [SHOPIFY_SMOKE_TOPIC] },
      "shopify:webhook_received",
    ),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SHOPIFY_WEBHOOK_RECEIVED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.topic !== SHOPIFY_SMOKE_TOPIC) return false;
    if (payload.shopDomain !== identity.shopDomain) return false;
    const body = payload.body as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== "object") return false;
    // Marker proof: the verbatim-forwarded body preserves the smoke-minted
    // order name (crsmoke marker) + id.
    return body.id === identity.orderId && body.name === identity.orderName;
  },
};
