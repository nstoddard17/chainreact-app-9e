import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  lineItemsSearch,
  type LineItemsSearchFilter,
} from "../../../_shared/hubspot/api/lineItems";
import { GetLineItemsConfigSchema } from "./getLineItems.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "name",
  "hs_product_id",
  "quantity",
  "price",
  "amount",
];

/**
 * HubSpot `get_line_items` action handler — HubSpot 2.1.
 *
 * POSTs `/crm/v3/objects/line_items/search` with the configured
 * filters + pagination. Mirrors `get_contacts` shape exactly
 * (filterGroups single-group AND, comma-or-array properties parse,
 * EQ-only filter operator, paging cursor).
 *
 * Output is bounded:
 *   { lineItems, count, total, nextCursor, hasMore }
 *
 * `paging.next.link` (which embeds the provider host) is NOT surfaced.
 */
export const getLineItems: ActionHandler = async (input) => {
  const config = GetLineItemsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties = (() => {
    if (config.properties === undefined) return DEFAULT_PROPERTIES;
    if (Array.isArray(config.properties)) return config.properties;
    return config.properties
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  })();

  const filters: LineItemsSearchFilter[] = [];
  if (config.filterProperty && config.filterValue) {
    filters.push({
      propertyName: config.filterProperty,
      operator: "EQ",
      value: config.filterValue,
    });
  }

  const response = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      lineItemsSearch({
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
      lineItems: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
