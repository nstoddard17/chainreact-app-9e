import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dealsSearch } from "../../_shared/hubspot/api/deals";
import type { ContactsSearchFilter } from "../../_shared/hubspot/api/contacts";
import { GetDealsConfigSchema } from "./getDeals.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
];

/**
 * HubSpot `get_deals` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/deals/search`. Same shape as `get_contacts`.
 * Output: `{ deals, count, total, nextCursor, hasMore }`.
 */
export const getDeals: ActionHandler = async (input) => {
  const config = GetDealsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties = (() => {
    if (config.properties === undefined) return DEFAULT_PROPERTIES;
    if (Array.isArray(config.properties)) return config.properties;
    return config.properties.split(",").map((p) => p.trim()).filter(Boolean);
  })();

  const filters: ContactsSearchFilter[] = [];
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
      dealsSearch({
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
      deals: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
