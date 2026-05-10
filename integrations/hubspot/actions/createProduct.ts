import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productsCreate } from "../../_shared/hubspot/api/products";
import { CreateProductConfigSchema } from "./createProduct.schema";

const OPTIONAL_FIELDS = [
  "description",
  "price",
  "hs_sku",
  "hs_cost_of_goods_sold",
  "hs_recurring_billing_period",
] as const;

/**
 * HubSpot `create_product` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/products`. No associations (products live
 * standalone in HubSpot's CRM; they're referenced by line items via
 * `hs_product_id`).
 */
export const createProduct: ActionHandler = async (input) => {
  const config = CreateProductConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = { name: config.name };
  for (const k of OPTIONAL_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }

  const product = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      productsCreate({ accessToken, properties }),
  });

  return {
    output: {
      productId: product.id,
      name: product.properties.name ?? config.name,
      price: product.properties.price ?? null,
      sku: product.properties.hs_sku ?? null,
      createdAt: product.createdAt ?? null,
      updatedAt: product.updatedAt ?? null,
      properties: product.properties,
    },
  };
};
