import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { chargesListExpanded } from "@/integrations/stripe/api/charges";
import {
  filterAndSortByLabel,
  formatMinorUnitAmount,
  formatUnixDate,
  mapStripeOptionsError,
  requireStripeIntegration,
} from "./_shared";

/**
 * `stripe:charges` options resolver — RESOLVERS-2.
 *
 * Backs `create_refund.chargeId` — the last raw `ch_xxx` text box on
 * the refund node. One bounded page of
 * `GET /v1/charges?limit=100&expand[]=data.customer`
 * (https://docs.stripe.com/api/charges/list) with local `ctx.q`
 * filtering. Account-scoped — `create_refund` has no customer field to
 * hang a dep off, and a refund operator is picking "the charge I need
 * to reverse", not browsing one customer.
 *
 * Label: "$42.00 — Acme Corp — 2026-07-01" — amount (formatted from
 * MINOR units using the charge's own currency, so JPY isn't misreported
 * 100x), then the merchant's own charge description if set else the
 * expanded customer NAME, then the created date. A bare `ch_...` tells
 * an operator nothing about which payment they're about to reverse.
 * Customer NAME only — never email / phone / balance (the `_shared.ts`
 * label policy). Value is the raw `ch_...` id the handler already
 * stores; the id rides in `description`.
 *
 * Ordering note: Stripe returns charges newest-first, but the shared
 * `filterAndSortByLabel` re-sorts alphabetically for consistency with
 * the other Stripe pickers — which, because every label leads with the
 * amount, groups by amount rather than recency. Acceptable: the
 * operator is matching a known amount + name, and `ctx.q` is the real
 * find path.
 *
 * NOT filtered to refundable charges: Stripe's list endpoint has no
 * `refunded` / `paid` filter, so post-filtering this page would make
 * `has_more` dishonest (it describes Stripe's page, not ours) and would
 * silently hide partially-refunded charges that are still legitimately
 * refundable. Stripe rejects a double refund at execution time.
 *
 * Needs live smoke; degrades to Reconnect + manual id entry.
 */
const PAGE_SIZE = 100;

export const stripeChargesResolver: OptionsResolver = {
  source: "stripe:charges",
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
          chargesListExpanded({
            accessToken,
            limit: PAGE_SIZE,
            expandCustomer: true,
          }),
      });
    } catch (err) {
      mapStripeOptionsError(err, "charges");
    }

    const items: OptionItem[] = [];
    for (const charge of response.data) {
      if (!charge.id) continue;
      const amount = formatMinorUnitAmount(charge.amount, charge.currency);
      const customerName =
        typeof charge.customer === "object" && charge.customer !== null
          ? charge.customer.name
          : null;
      // Merchant's own description first (most specific), then the
      // customer's name. Both are optional on Stripe's side.
      const who = charge.description ?? customerName;
      const when = formatUnixDate(charge.created);
      items.push({
        value: charge.id,
        label: who ? `${amount} — ${who} — ${when}` : `${amount} — ${when}`,
        description: charge.id,
      });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: response.has_more,
    };
  },
};
