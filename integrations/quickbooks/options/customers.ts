import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { customerList } from "@/integrations/_shared/quickbooks/api/customers";
import {
  filterAndSortByLabel,
  mapQuickbooksOptionsError,
  requireQuickbooksIntegration,
} from "./_shared";

/**
 * `quickbooks:customers` options resolver — QUICKBOOKS-1.
 *
 * Backs the customer pickers on get_customer / create_invoice /
 * list_invoices. One bounded page of active customers (ORDERBY
 * DisplayName server-side); QBO's query language supports LIKE but the
 * V2 posture for ≤100-row catalogs is local `ctx.q` filtering
 * (Calendly precedent). Values are customer ids; labels are display
 * names ONLY — no emails, no balances.
 */
const PAGE_SIZE = 100;

export const quickbooksCustomersResolver: OptionsResolver = {
  source: "quickbooks:customers",
  provider: "quickbooks",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireQuickbooksIntegration(ctx);

    let customers;
    try {
      customers = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "quickbooks",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          customerList({
            accessToken,
            realmId: integration.providerAccountId,
            maxResults: PAGE_SIZE,
          }),
      });
    } catch (err) {
      mapQuickbooksOptionsError(err, "customers");
    }

    const items: OptionItem[] = [];
    for (const customer of customers) {
      if (!customer.customerId) continue;
      items.push({
        value: customer.customerId,
        label: customer.displayName ?? customer.customerId,
      });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: customers.length === PAGE_SIZE,
    };
  },
};
