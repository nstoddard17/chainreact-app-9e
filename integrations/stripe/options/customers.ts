import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { customersList } from "@/integrations/stripe/api/customers";
import {
  filterAndSortByLabel,
  mapStripeOptionsError,
  requireStripeIntegration,
} from "./_shared";

/**
 * `stripe:customers` options resolver — RESOLVERS-1.
 *
 * Backs the customer pickers on create_subscription / create_invoice /
 * create_payment_intent / create_checkout_session / update_customer /
 * cancel-family fields. One bounded page (`GET /v1/customers?limit=100`,
 * https://docs.stripe.com/api/customers/list) with local `ctx.q`
 * filtering (QuickBooks/Calendly ≤100-row posture).
 *
 * Labels are customer NAMES only — never email/phone/balance. Unnamed
 * customers fall back to their Stripe id so every row stays pickable;
 * the id always rides in `description` for disambiguation. Values are
 * the raw `cus_...` ids the handler schemas already store.
 *
 * Needs live smoke (no Stripe account in the build environment);
 * degrades to Reconnect state + manual id entry like every picker.
 */
const PAGE_SIZE = 100;

export const stripeCustomersResolver: OptionsResolver = {
  source: "stripe:customers",
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
          customersList({ accessToken, limit: PAGE_SIZE }),
      });
    } catch (err) {
      mapStripeOptionsError(err, "customers");
    }

    const items: OptionItem[] = [];
    for (const customer of response.data) {
      if (!customer.id) continue;
      items.push({
        value: customer.id,
        label: customer.name ?? customer.id,
        description: customer.name ? customer.id : undefined,
      });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: response.has_more,
    };
  },
};
