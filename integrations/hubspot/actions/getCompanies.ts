import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { companiesSearch } from "../../_shared/hubspot/api/companies";
import type { ContactsSearchFilter } from "../../_shared/hubspot/api/contacts";
import { GetCompaniesConfigSchema } from "./getCompanies.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "name",
  "domain",
  "city",
  "state",
  "country",
  "industry",
];

/**
 * HubSpot `get_companies` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/companies/search`. Same shape as
 * `get_contacts`; output is `{ companies, count, total, nextCursor,
 * hasMore }`.
 */
export const getCompanies: ActionHandler = async (input) => {
  const config = GetCompaniesConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
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
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      companiesSearch({
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
      companies: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
