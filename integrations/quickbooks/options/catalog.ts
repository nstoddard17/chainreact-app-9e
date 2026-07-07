import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  itemList,
  taxCodeList,
  termList,
  type QuickbooksCatalogEntry,
} from "@/integrations/_shared/quickbooks/api/catalog";
import {
  filterAndSortByLabel,
  mapQuickbooksOptionsError,
  requireQuickbooksIntegration,
} from "./_shared";

/**
 * Catalog options resolvers (`quickbooks:items` / `quickbooks:terms` /
 * `quickbooks:tax_codes`) — QUICKBOOKS-1.
 *
 * Three small active-record catalogs behind one factory: each is a
 * single bounded query via the typed wrappers, id values + name-only
 * labels, local `ctx.q` filtering. `items` exists for id discovery
 * next to create_invoice's line rows (object-list sub-fields can't
 * bind option sources — documented limitation on the meta);
 * `terms`/`tax_codes` back the term/tax pickers directly.
 */
const PAGE_SIZE = 100;

function makeCatalogResolver(input: {
  source: string;
  what: string;
  fetch: (args: {
    accessToken: string;
    realmId: string;
    maxResults: number;
  }) => Promise<QuickbooksCatalogEntry[]>;
}): OptionsResolver {
  return {
    source: input.source,
    provider: "quickbooks",
    requiresIntegration: true,
    async resolve(ctx) {
      const integration = requireQuickbooksIntegration(ctx);

      let entries: QuickbooksCatalogEntry[];
      try {
        entries = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "quickbooks",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            input.fetch({
              accessToken,
              realmId: integration.providerAccountId,
              maxResults: PAGE_SIZE,
            }),
        });
      } catch (err) {
        mapQuickbooksOptionsError(err, input.what);
      }

      const items: OptionItem[] = entries.map((entry) => ({
        value: entry.id,
        label: entry.name,
      }));

      return {
        items: filterAndSortByLabel(items, ctx.q),
        hasMore: entries.length === PAGE_SIZE,
      };
    },
  };
}

export const quickbooksItemsResolver = makeCatalogResolver({
  source: "quickbooks:items",
  what: "items",
  fetch: itemList,
});

export const quickbooksTermsResolver = makeCatalogResolver({
  source: "quickbooks:terms",
  what: "payment terms",
  fetch: termList,
});

export const quickbooksTaxCodesResolver = makeCatalogResolver({
  source: "quickbooks:tax_codes",
  what: "tax codes",
  fetch: taxCodeList,
});
