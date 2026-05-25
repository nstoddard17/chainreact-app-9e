import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Shopify discovery sub-registry — Slice 4.SHOPIFY-META-2.
 *
 * Per-provider extraction of the Shopify meta imports so the central
 * `services/discovery/_registry.ts` stays under the 400-line lint cap
 * (same pattern as `providers/mailchimp.ts` et al.). The central registry
 * spreads `SHOPIFY_ACTION_METAS` / `SHOPIFY_TRIGGER_METAS` into its
 * `ALL_ACTION_META` / `ALL_TRIGGER_META` arrays; module-load validation
 * (`ActionMetaSchema.parse` + `TriggerMetaSchema.parse` + duplicate-key
 * rejection) still happens centrally — this file is purely import grouping.
 *
 * **Coverage:** 11 actions + 1 webhook trigger. Field names are snake_case
 * to mirror the runtime Zod schemas 1:1 (drift fails the meta-coverage
 * structural test once `shopify` is in `COVERED_PROVIDERS`). The trigger
 * registers its activation hook via
 * `registerActivation("shopify", "webhook_received", activate)` in
 * `integrations/shopify/triggers/webhookReceived/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 *
 * **No options resolvers in this slice** — every Shopify field is a flat
 * scalar / id / enum (IDs are hand-typeable). Resolvers are a deferred
 * follow-up (SHOPIFY-META-3); see
 * `docs/slices/phase-4/shopify-metadata-coverage-plan.md` §3.
 */

import { shopifyCreateOrderMeta } from "@/integrations/shopify/actions/createOrder.meta";
import { shopifyUpdateOrderStatusMeta } from "@/integrations/shopify/actions/updateOrderStatus.meta";
import { shopifyAddOrderNoteMeta } from "@/integrations/shopify/actions/addOrderNote.meta";
import { shopifyCreateFulfillmentMeta } from "@/integrations/shopify/actions/createFulfillment.meta";
import { shopifyCreateProductMeta } from "@/integrations/shopify/actions/createProduct.meta";
import { shopifyUpdateProductMeta } from "@/integrations/shopify/actions/updateProduct.meta";
import { shopifyCreateProductVariantMeta } from "@/integrations/shopify/actions/createProductVariant.meta";
import { shopifyUpdateProductVariantMeta } from "@/integrations/shopify/actions/updateProductVariant.meta";
import { shopifyCreateCustomerMeta } from "@/integrations/shopify/actions/createCustomer.meta";
import { shopifyUpdateCustomerMeta } from "@/integrations/shopify/actions/updateCustomer.meta";
import { shopifyUpdateInventoryMeta } from "@/integrations/shopify/actions/updateInventory.meta";

import { shopifyWebhookReceivedTriggerMeta } from "@/integrations/shopify/triggers/webhookReceived/webhookReceived.meta";

/**
 * Shopify action metas in displayOrder (10..110): orders (create / status /
 * note / fulfillment), products + variants (create / update), customers
 * (create / update), inventory. `update_order_status` is the lone high-risk
 * + requiresConfirmation entry (Cancel operation — Marcus decision).
 */
export const SHOPIFY_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  shopifyCreateOrderMeta,
  shopifyUpdateOrderStatusMeta,
  shopifyAddOrderNoteMeta,
  shopifyCreateFulfillmentMeta,
  shopifyCreateProductMeta,
  shopifyUpdateProductMeta,
  shopifyCreateProductVariantMeta,
  shopifyUpdateProductVariantMeta,
  shopifyCreateCustomerMeta,
  shopifyUpdateCustomerMeta,
  shopifyUpdateInventoryMeta,
];

/** Shopify trigger metas — 1 consolidated webhook trigger. */
export const SHOPIFY_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  shopifyWebhookReceivedTriggerMeta,
];
