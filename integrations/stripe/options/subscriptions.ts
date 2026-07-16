import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { subscriptionsList } from "@/integrations/stripe/api/subscriptions";
import {
  filterAndSortByLabel,
  mapStripeOptionsError,
  requireStripeIntegration,
} from "./_shared";

/**
 * `stripe:subscriptions` options resolver — RESOLVERS-1.
 *
 * Backs the subscription pickers on update_subscription /
 * cancel_subscription / find_subscription. One bounded page of
 * `GET /v1/subscriptions?status=all&expand[]=data.customer&limit=100`
 * (https://docs.stripe.com/api/subscriptions/list) with local `ctx.q`
 * filtering.
 *
 * Label: "<customer name or id> — <status>" (a bare `sub_...` id means
 * nothing to a human; the expanded customer's NAME is the only PII-safe
 * anchor — never email). The subscription id rides in `description`
 * and is the stored value the handler schemas already expect.
 *
 * Needs live smoke; degrades to Reconnect + manual id entry.
 */
const PAGE_SIZE = 100;

export const stripeSubscriptionsResolver: OptionsResolver = {
  source: "stripe:subscriptions",
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
          subscriptionsList({
            accessToken,
            limit: PAGE_SIZE,
            status: "all",
            expandCustomer: true,
          }),
      });
    } catch (err) {
      mapStripeOptionsError(err, "subscriptions");
    }

    const items: OptionItem[] = [];
    for (const sub of response.data) {
      if (!sub.id) continue;
      const customerLabel =
        typeof sub.customer === "object" && sub.customer !== null
          ? (sub.customer.name ?? sub.customer.id)
          : typeof sub.customer === "string"
            ? sub.customer
            : "customer";
      items.push({
        value: sub.id,
        label: `${customerLabel} — ${sub.status}`,
        description: sub.id,
      });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: response.has_more,
    };
  },
};
