import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productsUpdate } from "../../_shared/shopify/api/products";
import { UpdateProductConfigSchema } from "./updateProduct.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `update_product` Shopify action handler (Slice 12 Commit 3).
 *
 * PUT `/admin/api/2024-10/products/{id}.json`. All fields except
 * `product_id` are optional — only supplied fields are updated on
 * Shopify's side.
 */
export const updateProduct: ActionHandler = async (input) => {
  const config = UpdateProductConfigSchema.parse(input.config);
  const { shopDomain, providerAccountId } = await resolveShopDomain({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const product = await refreshAndRetry({
    accountId: input.accountId,
    provider: "shopify",
    providerAccountId,
    apiCall: (accessToken) =>
      productsUpdate({
        shopDomain,
        accessToken,
        productId: config.product_id,
        title: config.title,
        body_html: config.body_html,
        vendor: config.vendor,
        product_type: config.product_type,
        tags: config.tags,
        published: config.published,
      }),
  });

  return {
    output: {
      success: true,
      productId: product.id,
      title: product.title ?? null,
      status: product.status ?? null,
      adminUrl: `https://${shopDomain}/admin/products/${product.id}`,
      updatedAt: product.updated_at ?? null,
    },
  };
};
