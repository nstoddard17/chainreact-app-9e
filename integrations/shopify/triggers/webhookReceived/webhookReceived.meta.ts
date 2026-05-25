import type { TriggerMeta } from "@/contracts/triggerMeta";
import { SHOPIFY_ALLOWED_TOPICS } from "./allowedTopics";

/**
 * Builder-facing metadata for `shopify:webhook_received` — Slice 4.SHOPIFY-META-2.
 *
 * Consolidated Shopify webhook trigger. ONE trigger meta covers every topic
 * in `allowedTopics.ts` (8 as of Slice 12). Workflow authors pick a subset
 * of topics at config time and branch on `payload.topic` to discriminate.
 *
 * Activation is webhook-shaped. `index.ts` calls
 * `registerActivation("shopify", "webhook_received", activate)`, so the
 * `trigger-meta-activation-invariant` test is satisfied without a
 * `SHARED_INFRA_EXEMPT_KEYS` entry. Activate creates one Shopify webhook
 * subscription per selected topic; Shopify webhooks never expire (no
 * renewal cron / no `subscription-watch` marker).
 *
 * Topics ship as a static `select` + `multiple` (Shopify's topics are a
 * fixed enum — a native multi-select beats the paste-JSON bridge HubSpot
 * used for its per-property subscription objects).
 *
 * Payload mirrors `normalize.ts:normalizeShopifyEvent.payload` exactly:
 * `{ topic, shopDomain, webhookId, body }`. `body` is the raw, un-flattened
 * Shopify resource snapshot (Order / Customer / Product / InventoryLevel,
 * etc.) and MUST stay sensitive — it carries customer emails, addresses,
 * names, and order/payment data.
 */
export const shopifyWebhookReceivedTriggerMeta: TriggerMeta = {
  key: "shopify:webhook_received",
  provider: "shopify",
  type: "webhook_received",
  displayName: "Webhook Received",
  description:
    "Fires when Shopify delivers a webhook for one of the selected topics. ONE consolidated trigger covers every supported topic — workflows branch on `payload.topic` (e.g. `orders/create` vs `customers/create`). The raw Shopify resource is available un-flattened at `payload.body`.",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "topics",
      label: "Topics",
      description:
        "Select one or more Shopify webhook topics to subscribe to. Activation creates one Shopify webhook subscription per selected topic.",
      type: "select",
      required: true,
      multiple: true,
      options: [
        { value: "orders/create", label: "Order created" },
        { value: "orders/paid", label: "Order paid" },
        { value: "orders/fulfilled", label: "Order fulfilled" },
        { value: "orders/updated", label: "Order updated" },
        { value: "customers/create", label: "Customer created" },
        { value: "products/update", label: "Product updated" },
        { value: "checkouts/create", label: "Checkout created" },
        { value: "inventory_levels/update", label: "Inventory level updated" },
      ],
    },
  ],
  payloadShape: [
    {
      name: "topic",
      type: "string",
      description:
        "The Shopify topic that fired (e.g. `orders/create`). Branch on this to discriminate inside a multi-topic trigger.",
    },
    {
      name: "shopDomain",
      type: "string",
      description:
        "The shop the webhook came from (matches the integration's account). Opaque domain, safe to surface.",
    },
    {
      name: "webhookId",
      type: "string",
      description:
        "Per-delivery webhook id used for dedup. Null on legacy delivery paths.",
    },
    {
      name: "body",
      type: "object",
      description:
        "Raw Shopify resource snapshot for the topic (Order / Customer / Product / InventoryLevel, etc.), forwarded verbatim. Drill in via `{{trigger.payload.body.<field>}}`. Marked sensitive — carries customer emails, addresses, names, and order/payment data.",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};

// Compile-time guard: the meta's 8 static topic options must stay in sync
// with the runtime allowlist (a readonly tuple, so `.length` is the literal
// `8`). If a topic is added/removed in allowedTopics.ts, this assignment
// stops type-checking and forces the options[] above to be updated too.
const _TOPIC_COUNT_GUARD: 8 = SHOPIFY_ALLOWED_TOPICS.length;
void _TOPIC_COUNT_GUARD;
