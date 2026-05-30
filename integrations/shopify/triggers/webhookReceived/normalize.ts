import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a Shopify webhook delivery to V2's canonical `TriggerEvent`
 * shape — Slice 12 Commit 4.
 *
 * Shopify's wire format:
 *   - Routing metadata lives in HEADERS (X-Shopify-Topic,
 *     X-Shopify-Shop-Domain, X-Shopify-Webhook-Id, X-Shopify-Triggered-At).
 *   - The body is the resource snapshot — Order, Customer, Product,
 *     InventoryLevel, etc. — with no event-envelope wrapper. V2
 *     forwards the raw body verbatim under `payload.body` so workflows
 *     can drill into resource fields directly via
 *     `{{nodeId.payload.body.email}}`-style references.
 *
 * Per Slice 12 plan §"Confirmed scope decisions" Q16: we DO NOT flatten
 * or per-topic-normalize the body. V1's `transformShopifyPayload` is
 * intentionally dropped — workflows reference the raw Shopify shape.
 *
 * Per Slice 12 plan §"Confirmed scope decisions" Q14: dedup key is the
 * `X-Shopify-Webhook-Id` header (preferred) with a derived fallback
 * `${shop}:${topic}:${body.id}:${body.updated_at|created_at}` when the
 * header is absent (legacy delivery paths or test harnesses that omit
 * it).
 *
 * Canonical TriggerEvent fields:
 *   - `provider: "shopify"`.
 *   - `eventType: "webhook_received"` — the consolidated trigger name
 *     (matches `findActivation("shopify", "webhook_received")`).
 *     Workflows branch on `payload.topic` for the actual Shopify
 *     topic discriminator (e.g. `"orders/create"`).
 *   - `eventId` — the dedup key. Used by `webhook_event_dedup` to
 *     block retries.
 *   - `occurredAt` — ISO-8601. Prefers `X-Shopify-Triggered-At`
 *     header; falls back to body's `created_at` / `updated_at` /
 *     `now()`.
 *   - `accountId` — shop domain (matches the integration's
 *     `providerAccountId`).
 *   - `payload` carries `topic` / `shopDomain` / `webhookId` / `body`
 *     for workflow consumption.
 */

export const SHOPIFY_TRIGGER_EVENT_TYPE = "webhook_received";

export interface ShopifyHeaders {
  topic: string;
  shopDomain: string;
  /** Per-delivery unique id for dedup. May be null for legacy paths. */
  webhookId: string | null;
  /** Provider-supplied trigger timestamp (ISO-8601). May be null. */
  triggeredAt: string | null;
}

export interface NormalizeShopifyEventInput {
  headers: ShopifyHeaders;
  /** Parsed body (the resource snapshot). */
  body: Record<string, unknown>;
}

function bestOccurredAt(
  triggeredAt: string | null,
  body: Record<string, unknown>,
): string {
  if (triggeredAt && typeof triggeredAt === "string") return triggeredAt;
  const updated = body.updated_at;
  if (typeof updated === "string" && updated.length > 0) return updated;
  const created = body.created_at;
  if (typeof created === "string" && created.length > 0) return created;
  return new Date().toISOString();
}

function fallbackDedupKey(
  headers: ShopifyHeaders,
  body: Record<string, unknown>,
): string {
  // `${shop}:${topic}:${body.id}:${body.updated_at|created_at}`. Per
  // Slice 12 plan §"Confirmed scope decisions" Q14 — defensive shape
  // for the rare legacy paths where X-Shopify-Webhook-Id is absent.
  const id = body.id ?? "no-id";
  const ts = body.updated_at ?? body.created_at ?? "no-ts";
  return `${headers.shopDomain}:${headers.topic}:${String(id)}:${String(ts)}`;
}

export function normalizeShopifyEvent(
  input: NormalizeShopifyEventInput,
): TriggerEvent {
  const eventId = input.headers.webhookId
    ? input.headers.webhookId
    : fallbackDedupKey(input.headers, input.body);

  return {
    provider: "shopify",
    eventType: SHOPIFY_TRIGGER_EVENT_TYPE,
    eventId,
    occurredAt: bestOccurredAt(input.headers.triggeredAt, input.body),
    providerAccountId: input.headers.shopDomain,
    payload: {
      topic: input.headers.topic,
      shopDomain: input.headers.shopDomain,
      webhookId: input.headers.webhookId,
      body: input.body,
    },
  };
}
