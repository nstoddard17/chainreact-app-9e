import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  productsSearch,
  type ProductsSearchFilter,
} from "../../_shared/hubspot/api/products";
import { GetProductsConfigSchema } from "./getProducts.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "name",
  "description",
  "price",
  "hs_sku",
];

/**
 * HubSpot `get_products` action handler — HubSpot 2.1.
 *
 * POSTs `/crm/v3/objects/products/search` with the configured filters +
 * pagination. Mirrors `get_contacts` / `get_line_items` shape.
 *
 * Output is bounded:
 *   { products, count, total, nextCursor, hasMore }
 *
 * `paging.next.link` (which embeds the provider host) is NOT surfaced.
 */
export const getProducts: ActionHandler = async (input) => {
  const config = GetProductsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties = (() => {
    if (config.properties === undefined) return DEFAULT_PROPERTIES;
    if (Array.isArray(config.properties)) return config.properties;
    return config.properties
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  })();

  const filters: ProductsSearchFilter[] = [];
  if (config.filterProperty && config.filterValue) {
    filters.push({
      propertyName: config.filterProperty,
      operator: "EQ",
      value: config.filterValue,
    });
  }

  const response = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      productsSearch({
        accessToken,
        limit: config.limit ?? 100,
        ...(config.after ? { after: config.after } : {}),
        properties,
        filters,
      }),
  });

  const nextCursor = response.paging?.next?.after ?? null;
  return {
    output: {
      products: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
