import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { variantsUpdate } from "../../_shared/shopify/api/products";
import { UpdateProductVariantConfigSchema } from "./updateProductVariant.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `update_product_variant` Shopify action handler — Shopify 2.1
 * Commit 1.
 *
 * PUT `/admin/api/2024-10/variants/{variant_id}.json` with the
 * connected shop's merchant access token. Only fields explicitly
 * present on the input are sent on the wire — Shopify's PATCH-style
 * PUT preserves all other variant fields untouched. PATCH semantics
 * match `update_product` (Slice 12) and `update_customer`.
 *
 * Inventory updates intentionally NOT supported here — workflow
 * authors compose `update_inventory` downstream. Same boundary V1
 * enforces (V1's `updateProductVariant.ts:78-85` comments
 * "Inventory quantity requires a separate mutation"). See
 * [`docs/slices/parity-shopify.md`](../../../docs/slices/parity-shopify.md) §13.
 *
 * Output is bounded — no raw Shopify response spread. Each documented
 * key is projected explicitly; the variant's `inventory_item_id` is
 * surfaced so workflow authors can chain into `update_inventory`
 * without an extra Shopify GET.
 */
export const updateProductVariant: ActionHandler = async (input) => {
  const config = UpdateProductVariantConfigSchema.parse(input.config);
  const { shopDomain, providerAccountId } = await resolveShopDomain({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const variant = await refreshAndRetry({
    accountId: input.accountId,
    provider: "shopify",
    providerAccountId,
    apiCall: (accessToken) =>
      variantsUpdate({
        shopDomain,
        accessToken,
        variantId: config.variant_id,
        price: config.price,
        compare_at_price: config.compare_at_price,
        sku: config.sku,
        barcode: config.barcode,
        option1: config.option1,
        option2: config.option2,
        option3: config.option3,
        weight: config.weight,
        weight_unit: config.weight_unit,
        taxable: config.taxable,
      }),
  });

  return {
    output: {
      success: true,
      variantId: variant.id,
      productId: variant.product_id ?? null,
      title: variant.title ?? null,
      price: variant.price ?? null,
      compareAtPrice: variant.compare_at_price ?? null,
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      option1: variant.option1 ?? null,
      option2: variant.option2 ?? null,
      option3: variant.option3 ?? null,
      inventoryItemId: variant.inventory_item_id ?? null,
      adminUrl:
        variant.product_id !== undefined
          ? `https://${shopDomain}/admin/products/${variant.product_id}/variants/${variant.id}`
          : `https://${shopDomain}/admin/variants/${variant.id}`,
      updatedAt: variant.updated_at ?? null,
    },
  };
};
