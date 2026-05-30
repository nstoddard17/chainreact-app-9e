import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ticketsSearch } from "../../_shared/hubspot/api/tickets";
import type { ContactsSearchFilter } from "../../_shared/hubspot/api/contacts";
import { GetTicketsConfigSchema } from "./getTickets.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "subject",
  "content",
  "hs_pipeline",
  "hs_pipeline_stage",
  "hs_ticket_priority",
];

/**
 * HubSpot `get_tickets` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/tickets/search`. Output:
 *   { tickets, count, total, nextCursor, hasMore }
 */
export const getTickets: ActionHandler = async (input) => {
  const config = GetTicketsConfigSchema.parse(input.config);

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
      ticketsSearch({
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
      tickets: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
