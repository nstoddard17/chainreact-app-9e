import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productsCreate } from "../../_shared/shopify/api/products";
import { CreateProductConfigSchema } from "./createProduct.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `create_product` Shopify action handler (Slice 12 Commit 3).
 *
 * POST `/admin/api/2024-10/products.json` with the connected shop's
 * merchant access token. Body wraps under `{ product: { ... } }` per
 * Shopify's REST convention.
 */
export const createProduct: ActionHandler = async (input) => {
  const config = CreateProductConfigSchema.parse(input.config);
  const { shopDomain, accountId } = await resolveShopDomain({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const product = await refreshAndRetry({
    userId: input.userId,
    provider: "shopify",
    accountId,
    apiCall: (accessToken) =>
      productsCreate({
        shopDomain,
        accessToken,
        title: config.title,
        body_html: config.body_html,
        vendor: config.vendor,
        product_type: config.product_type,
        price: config.price,
        sku: config.sku,
        inventory_quantity: config.inventory_quantity,
      }),
  });

  const defaultVariantId = product.variants?.[0]?.id ?? null;
  return {
    output: {
      productId: product.id,
      variantId: defaultVariantId,
      title: product.title ?? null,
      vendor: product.vendor ?? null,
      adminUrl: `https://${shopDomain}/admin/products/${product.id}`,
      createdAt: product.created_at ?? null,
    },
  };
};
