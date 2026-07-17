import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ordersList } from "@/integrations/_shared/shopify/api/orders";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterByLabel,
  mapShopifyOptionsError,
  requireShopifyIntegration,
} from "./_shared";

/**
 * `shopify:orders` options resolver — RESOLVERS-2.
 *
 * Backs the `order_id` picker on `shopify:update_order_status`,
 * `shopify:add_order_note`, and `shopify:create_fulfillment` (combobox +
 * manual entry — an order id mapped from an upstream trigger via
 * `{{...}}` keeps working unchanged). Account-scoped, no deps.
 *
 * Endpoint: `GET /admin/api/2024-10/orders.json?status=any&limit=50&…`
 * via the `ordersList` wrapper (`read_orders` scope, already required in
 * the manifest — no scope change, no reconnect).
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/order#get-orders
 *
 * `value` = the numeric order id as a string. The schemas accept
 * `string | number`, and the string form round-trips through the
 * combobox and `{{...}}` wiring unchanged.
 *
 * `label` = business-recognizable, id-free:
 *   `#1001 - Jane Smith - 84.20 USD - paid`
 * Order name first (that's what the merchant sees in Shopify admin and
 * on the customer's receipt), then the customer's NAME, total, and
 * financial status for disambiguation. Missing parts are dropped
 * cleanly, so a guest order with no total reads `#1001 - paid`. The
 * numeric id rides in `description` only.
 *
 * The total is rendered `84.20 USD` rather than `$84.20` — the shop's
 * currency is whatever the merchant set, and guessing a symbol per
 * ISO-4217 code would eventually print the wrong one.
 *
 * PRIVACY: the customer's name is the ONLY customer datum in the label —
 * `ordersList` drops email / phone / addresses at the wrapper boundary,
 * matching the `shopify:customers` posture.
 *
 * ORDERING: most-recent-first (the wrapper asks Shopify for
 * `order=created_at desc` and re-sorts the returned page descending
 * itself). `ctx.q` filters LOCALLY and preserves that order — Shopify's
 * REST order list has no search/filter param (order search is
 * GraphQL-only), and alpha-sorting would bury the newest order.
 * `hasMore` is honest: a full page means older orders exist beyond it —
 * refine with search or map/paste the id.
 *
 * The shop is pinned by the integration row (`providerAccountId` IS the
 * `*.myshopify.com` domain) — the same "config can never override the
 * shop" contract the action handlers follow.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED` (Shopify tokens
 * are non-refreshable; reconnect IS the fix); 403 →
 * `PROVIDER_REAUTH_REQUIRED`; other → `PROVIDER_ERROR` with static copy.
 */
export const shopifyOrdersResolver: OptionsResolver = {
  source: "shopify:orders",
  provider: "shopify",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireShopifyIntegration(ctx);

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "shopify",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          ordersList({
            shopDomain: integration.providerAccountId,
            accessToken,
          }),
      });
    } catch (err) {
      mapShopifyOptionsError(err, "orders");
    }

    const items: OptionItem[] = result.orders.map((o) => {
      const value = String(o.id);
      const name =
        o.name.length > 0
          ? o.name
          : o.orderNumber !== null
            ? `#${o.orderNumber}`
            : value;
      const total =
        o.totalPrice.length > 0
          ? o.currency.length > 0
            ? `${o.totalPrice} ${o.currency}`
            : o.totalPrice
          : "";
      const label = [name, o.customerName, total, o.financialStatus]
        .filter((part) => part.length > 0)
        .join(" - ");
      return { value, label, description: value };
    });

    return {
      items: filterByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
