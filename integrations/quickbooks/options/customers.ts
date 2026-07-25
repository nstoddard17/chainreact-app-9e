import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  CUSTOMER_SEARCH_MAX_LENGTH,
  customerList,
  customersByIds,
} from "@/integrations/_shared/quickbooks/api/customers";
import { mapQuickbooksOptionsError, requireQuickbooksIntegration } from "./_shared";

/**
 * `quickbooks:customers` options resolver.
 *
 * Backs the customer pickers on get_customer / create_invoice / list_invoices
 * and the Analytics Invoices dataset's customer filter and series.
 *
 * SEARCH IS SERVER-SIDE (QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1). The
 * original resolver fetched one 100-row page and filtered `ctx.q` locally,
 * which made every customer past the first 100 by display name UNREACHABLE:
 * typing the name of customer #457 returned nothing, because the filter only
 * ever saw rows 1-100. The term is now pushed into the QuickBooks query, so
 * any customer in the company can be found regardless of position, while the
 * response stays one bounded page.
 *
 * Semantics are live-certified, not assumed: `DisplayName LIKE '%term%'` is a
 * genuine case-insensitive CONTAINS match (interior matches observed), not a
 * prefix match. Ordering is `DisplayName` ascending.
 *
 * Values are customer ids; labels are display names ONLY — no emails, no
 * balances, no addresses, no phone numbers.
 */
const PAGE_SIZE = 100;

interface CustomerLike {
  customerId: string | null;
  displayName: string | null;
}

function toOption(customer: CustomerLike): OptionItem | null {
  if (!customer.customerId) return null;
  return {
    value: customer.customerId,
    label: customer.displayName ?? customer.customerId,
  };
}

export const quickbooksCustomersResolver: OptionsResolver = {
  source: "quickbooks:customers",
  provider: "quickbooks",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireQuickbooksIntegration(ctx);
    const search = ctx.q.trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH);

    const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({
        accountId: integration.accountId,
        provider: "quickbooks",
        providerAccountId: integration.providerAccountId,
        apiCall,
      });

    let page: Awaited<ReturnType<typeof customerList>>;
    // Saved selections the caller needs labelled — resolved in the SAME
    // request so a picker shows "Acme Ltd" rather than a raw QuickBooks id for
    // a customer that isn't on the current page, without loading the catalog.
    let selectedCustomers: CustomerLike[] = [];
    try {
      page = await call((accessToken) =>
        customerList({
          accessToken,
          realmId: integration.providerAccountId,
          maxResults: PAGE_SIZE,
          ...(search.length > 0 ? { search } : {}),
        }),
      );
      const missing = (ctx.selected ?? []).filter(
        (value) => !page.items.some((c) => c.customerId === value),
      );
      if (missing.length > 0) {
        selectedCustomers = await call((accessToken) =>
          customersByIds({
            accessToken,
            realmId: integration.providerAccountId,
            ids: missing,
          }),
        );
      }
    } catch (err) {
      mapQuickbooksOptionsError(err, "customers");
    }

    // Selected values first, so a saved selection is always present and
    // labelled; then the page. De-duplicated by value.
    const items: OptionItem[] = [];
    const seen = new Set<string>();
    for (const customer of [...selectedCustomers, ...page.items]) {
      const option = toOption(customer);
      if (!option || seen.has(option.value)) continue;
      seen.add(option.value);
      items.push(option);
    }

    return {
      items,
      // Honest: a full page means QuickBooks may hold more matches. Because
      // search now narrows server-side, refining the term is what reaches them.
      hasMore: page.hasMore,
    };
  },
};
