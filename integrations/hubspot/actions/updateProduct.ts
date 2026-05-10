import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productsUpdate } from "../../_shared/hubspot/api/products";
import { UpdateProductConfigSchema } from "./updateProduct.schema";

const UPDATABLE_FIELDS = [
  "name",
  "description",
  "price",
  "hs_sku",
  "hs_cost_of_goods_sold",
  "hs_recurring_billing_period",
] as const;

/**
 * HubSpot `update_product` action handler — Slice 13 Batch 2.
 *
 * PATCHes `/crm/v3/objects/products/{id}`. Throws if no property
 * fields are provided.
 */
export const updateProduct: ActionHandler = async (input) => {
  const config = UpdateProductConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {};
  for (const k of UPDATABLE_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(
      "hubspot update_product: at least one property field must be provided.",
    );
  }

  const product = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      productsUpdate({
        accessToken,
        productId: config.productId,
        properties,
      }),
  });

  return {
    output: {
      productId: product.id,
      name: product.properties.name ?? null,
      price: product.properties.price ?? null,
      sku: product.properties.hs_sku ?? null,
      updatedAt: product.updatedAt ?? null,
      properties: product.properties,
    },
  };
};
