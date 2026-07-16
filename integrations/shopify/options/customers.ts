import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { customersList } from "@/integrations/_shared/shopify/api/customers";
import {
  filterAndSortByLabel,
  mapShopifyOptionsError,
  requireShopifyIntegration,
} from "./_shared";

/**
 * `shopify:customers` options resolver — RESOLVERS-1.
 *
 * Backs the `update_customer.customer_id` picker (combobox + manual
 * entry — ids mapped from upstream steps still work).
 *
 * Endpoint: GET /admin/api/2024-10/customers.json?limit=100 via the
 * existing `customersList` wrapper (`read_customers` scope, already in
 * the manifest alongside `write_customers`). Docs:
 * https://shopify.dev/docs/api/admin-rest/2024-10/resources/customer#get-customers
 *
 * One bounded page (100); Shopify's REST customer search endpoint
 * exists but the V2 posture for ≤100-row pages is local `ctx.q`
 * filtering (QuickBooks/Calendly precedent). `hasMore` is honest: a
 * full page means more may exist — refine with search or paste an id.
 *
 * `value` = the numeric customer id as a string (exactly what
 * `update_customer.customer_id` stores). `label` = display name
 * (first + last), falling back to the customer id — **NO email, NO
 * phone, NO order counts / spend** ever appear in labels. The id rides
 * in `description` for disambiguation.
 *
 * The shop is pinned by the integration row: `providerAccountId` IS
 * the `*.myshopify.com` domain (action config can never override it —
 * same contract as the action handlers' `resolveShopDomain`).
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED` (Shopify
 * tokens are non-refreshable; reconnect IS the fix); other →
 * `PROVIDER_ERROR` with static copy.
 */
const PAGE_SIZE = 100;

export const shopifyCustomersResolver: OptionsResolver = {
  source: "shopify:customers",
  provider: "shopify",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireShopifyIntegration(ctx);
    const shopDomain = integration.providerAccountId;

    let customers;
    try {
      customers = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "shopify",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          customersList({
            shopDomain,
            accessToken,
            limit: PAGE_SIZE,
          }),
      });
    } catch (err) {
      mapShopifyOptionsError(err, "customers");
    }

    const items: OptionItem[] = [];
    for (const customer of customers) {
      if (customer.id === undefined || customer.id === null) continue;
      const id = String(customer.id);
      const name = [customer.first_name, customer.last_name]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .join(" ")
        .trim();
      items.push(
        name.length > 0
          ? { value: id, label: name, description: id }
          : { value: id, label: id },
      );
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: customers.length === PAGE_SIZE,
    };
  },
};
