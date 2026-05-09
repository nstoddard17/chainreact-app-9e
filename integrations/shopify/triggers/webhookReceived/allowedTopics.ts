/**
 * Curated allowlist of Shopify webhook topics — Slice 12 Commit 4.
 *
 * Mirrors V1's 8 separate trigger node types
 * ([V1 shopify/index.ts:50-417](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L50)).
 * V2 collapses those 8 trigger types into ONE consolidated
 * `webhook_received` trigger; workflow authors pick a subset of these
 * topics at trigger config time, and dispatch branches on the
 * `topic` discriminator in the payload.
 *
 * Activation rejects any topic outside this list with a typed error
 * — fail-loud at design time so misconfigured workflows never
 * silently subscribe to topics V2 doesn't intend to handle.
 *
 * Receive treats topics outside the activation-time selection as a
 * 200 quiet ack — defense-in-depth against dashboard re-config
 * subscribing the same endpoint to extra topics out-of-band.
 */
export const SHOPIFY_ALLOWED_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/fulfilled",
  "orders/updated",
  "customers/create",
  "products/update",
  "checkouts/create",
  "inventory_levels/update",
] as const;

export type ShopifyAllowedTopic = (typeof SHOPIFY_ALLOWED_TOPICS)[number];

const allowedSet: ReadonlySet<string> = new Set(SHOPIFY_ALLOWED_TOPICS);

export function isAllowedShopifyTopic(
  topic: string,
): topic is ShopifyAllowedTopic {
  return allowedSet.has(topic);
}
