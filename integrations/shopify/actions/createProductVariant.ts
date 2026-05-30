import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { variantsCreate } from "../../_shared/shopify/api/products";
import { CreateProductVariantConfigSchema } from "./createProductVariant.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `create_product_variant` Shopify action handler (Slice 12 Commit 3).
 *
 * POST `/admin/api/2024-10/products/{product_id}/variants.json` with
 * the connected shop's merchant access token.
 */
export const createProductVariant: ActionHandler = async (input) => {
  const config = CreateProductVariantConfigSchema.parse(input.config);
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
      variantsCreate({
        shopDomain,
        accessToken,
        productId: config.product_id,
        price: config.price,
        option1: config.option1,
        option2: config.option2,
        option3: config.option3,
        sku: config.sku,
        inventory_quantity: config.inventory_quantity,
        weight: config.weight,
        barcode: config.barcode,
      }),
  });

  return {
    output: {
      success: true,
      variantId: variant.id,
      productId: variant.product_id,
      sku: variant.sku ?? null,
      price: variant.price ?? null,
      adminUrl: `https://${shopDomain}/admin/products/${variant.product_id}/variants/${variant.id}`,
      createdAt: variant.created_at ?? null,
    },
  };
};
