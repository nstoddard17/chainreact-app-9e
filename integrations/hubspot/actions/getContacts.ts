import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  contactsSearch,
  type ContactsSearchFilter,
} from "../../_shared/hubspot/api/contacts";
import { GetContactsConfigSchema } from "./getContacts.schema";

const DEFAULT_PROPERTIES: readonly string[] = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "company",
];

/**
 * HubSpot `get_contacts` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/contacts/search` with the configured filters
 * + pagination. The wrapper uses HubSpot's documented
 * `filterGroups: [{ filters: [...] }]` shape — V1's top-level
 * `filters` array is the bug being fixed during port.
 *
 * Output:
 *   { contacts, count, total, nextCursor, hasMore }
 *
 *   `nextCursor` is the value to pass back as `after` on the next call
 *   to paginate. `hasMore` is `Boolean(nextCursor)`.
 */
export const getContacts: ActionHandler = async (input) => {
  const config = GetContactsConfigSchema.parse(input.config);

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
      contactsSearch({
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
      contacts: response.results,
      count: response.results.length,
      total: response.total,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
