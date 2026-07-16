import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { pricesList } from "@/integrations/stripe/api/prices";
import {
  filterAndSortByLabel,
  formatPriceAmount,
  mapStripeOptionsError,
  requireStripeIntegration,
} from "./_shared";

/**
 * `stripe:prices` options resolver — RESOLVERS-1.
 *
 * Backs the price pickers on create_subscription / update_subscription.
 * One bounded page of active prices with `expand[]=data.product`
 * (https://docs.stripe.com/api/prices/list) and local `ctx.q` filtering.
 *
 * Label: "<product name> — <amount>/<interval>" (e.g. "Pro Plan —
 * 29.00 USD/month"), falling back to the price nickname, then the id.
 * Catalog amounts are the merchant's own public pricing (not customer
 * PII) and are what makes two prices distinguishable. Values are the
 * raw `price_...` ids the handler schemas already store.
 *
 * Needs live smoke; degrades to Reconnect + manual id entry.
 */
const PAGE_SIZE = 100;

export const stripePricesResolver: OptionsResolver = {
  source: "stripe:prices",
  provider: "stripe",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireStripeIntegration(ctx);

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "stripe",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          pricesList({
            accessToken,
            limit: PAGE_SIZE,
            active: true,
            expandProduct: true,
          }),
      });
    } catch (err) {
      mapStripeOptionsError(err, "prices");
    }

    const items: OptionItem[] = [];
    for (const price of response.data) {
      if (!price.id) continue;
      const productName =
        typeof price.product === "object" && price.product !== null
          ? price.product.name
          : null;
      const amount = formatPriceAmount(
        price.unit_amount,
        price.currency,
        price.recurring?.interval ?? null,
      );
      const head = productName ?? price.nickname ?? price.id;
      items.push({
        value: price.id,
        label: `${head} — ${amount}`,
        description: price.id,
      });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: response.has_more,
    };
  },
};
