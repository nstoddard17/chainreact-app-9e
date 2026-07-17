import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolver,
  type OptionsResolverContext,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import { paymentMethodsList } from "@/integrations/stripe/api/paymentMethods";
import { paymentIntentsGet } from "@/integrations/stripe/api/paymentIntents";
import { subscriptionsGet } from "@/integrations/stripe/api/subscriptions";
import {
  filterAndSortByLabel,
  formatPaymentMethodLabel,
  mapStripeOptionsError,
  requireStripeIntegration,
} from "./_shared";

/**
 * Stripe payment-method pickers — RESOLVERS-2.
 *
 * Backs the three raw `pm_xxx` text boxes the CONFIG-UX audit flagged:
 * `create_subscription.default_payment_method`,
 * `update_subscription.default_payment_method`, and
 * `confirm_payment_intent.payment_method`.
 *
 * ── Why THREE resolvers and not one ────────────────────────────────
 * Stripe only lists payment methods scoped to a customer
 * (`GET /v1/payment_methods?customer=…`), but only ONE of the three
 * consumer actions actually has a customer field:
 *
 *   - create_subscription     → `customerId`      (customer in hand)
 *   - update_subscription     → `subscriptionId`  (customer is one hop away)
 *   - confirm_payment_intent  → `paymentIntentId` (customer is one hop away)
 *
 * Deps are keyed by the PARENT FIELD NAME end to end — SchemaForm sends
 * `deps = { [parentFieldName]: value }` and `resolveOptionsSource`
 * checks `requiredDeps` against those keys before dispatch. A single
 * `requiredDeps: ["customerId"]` resolver would therefore go dead on
 * the other two actions (MISSING_DEPENDENCY forever). Renaming the
 * runtime fields to line the deps up is off the table — they are
 * shipped `.strict()` schema keys. So this file mirrors the
 * `microsoft-powerbi:target_semantic_models` precedent: same wrapper,
 * same mapping, one resolver per dep name.
 *
 * The two indirect variants resolve the customer first
 * (`subscriptionsGet` / `paymentIntentsGet`, both already shipped for
 * the handlers) and then reuse the shared listing below.
 *
 * ── Label / value policy ───────────────────────────────────────────
 * Label is "Visa ending 4242 — exp 08/2027" (brand + last4 + expiry) —
 * a bare `pm_...` is meaningless to a human. NEVER a full PAN (Stripe
 * returns `last4` only, and the wrapper's response type doesn't even
 * pin `billing_details`, so no cardholder name / email / address can
 * reach a label). Value is the raw `pm_...` id the handler schemas
 * already store; the id rides in `description` for disambiguation when
 * a customer has two identical-looking cards.
 *
 * Degrades honestly: a PaymentIntent with no customer, or a
 * deleted/absent parent, yields an EMPTY picker rather than a fake
 * one — `allowManualEntry` keeps the field typeable / mappable.
 *
 * Needs live smoke (no Stripe account in the build environment).
 */
const PAGE_SIZE = 100;

/**
 * Shared listing: one bounded page of every payment-method type
 * attached to `customerId`, mapped to option items.
 */
async function listPaymentMethodsForCustomer(
  ctx: OptionsResolverContext,
  customerId: string,
): Promise<{ items: OptionItem[]; hasMore: boolean }> {
  const integration = requireStripeIntegration(ctx);

  let response;
  try {
    response = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "stripe",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        paymentMethodsList({
          accessToken,
          customer: customerId,
          limit: PAGE_SIZE,
        }),
    });
  } catch (err) {
    // The customer was deleted out from under a saved config — empty
    // picker (cascade fallback), not a scary provider error.
    if (err instanceof NotFoundError) return { items: [], hasMore: false };
    mapStripeOptionsError(err, "payment methods");
  }

  const items: OptionItem[] = [];
  for (const pm of response.data) {
    if (!pm.id) continue;
    items.push({
      value: pm.id,
      label: formatPaymentMethodLabel(pm),
      description: pm.id,
    });
  }

  return {
    items: filterAndSortByLabel(items, ctx.q),
    hasMore: response.has_more,
  };
}

/** Read a required dep, or throw the typed MISSING_DEPENDENCY. */
function requireDep(
  ctx: OptionsResolverContext,
  name: string,
  selectPrompt: string,
): string {
  const value = ctx.deps[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new OptionsResolverError("MISSING_DEPENDENCY", selectPrompt);
  }
  return value;
}

/**
 * `stripe:payment_methods` — dep: `customerId`.
 * Backs `create_subscription.default_payment_method`.
 */
export const stripePaymentMethodsResolver: OptionsResolver = {
  source: "stripe:payment_methods",
  provider: "stripe",
  requiresIntegration: true,
  requiredDeps: ["customerId"],
  async resolve(ctx) {
    const customerId = requireDep(ctx, "customerId", "Select a customer first.");
    return listPaymentMethodsForCustomer(ctx, customerId);
  },
};

/**
 * `stripe:subscription_payment_methods` — dep: `subscriptionId`.
 * Backs `update_subscription.default_payment_method`. Two-hop: the
 * subscription names its customer, then the shared listing runs.
 */
export const stripeSubscriptionPaymentMethodsResolver: OptionsResolver = {
  source: "stripe:subscription_payment_methods",
  provider: "stripe",
  requiresIntegration: true,
  requiredDeps: ["subscriptionId"],
  async resolve(ctx) {
    const integration = requireStripeIntegration(ctx);
    const subscriptionId = requireDep(
      ctx,
      "subscriptionId",
      "Select a subscription first.",
    );

    let subscription;
    try {
      subscription = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "stripe",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          subscriptionsGet({ accessToken, subscriptionId }),
      });
    } catch (err) {
      // Subscription no longer exists — empty picker, not an error.
      if (err instanceof NotFoundError) return { items: [], hasMore: false };
      mapStripeOptionsError(err, "payment methods");
    }

    if (!subscription.customer) return { items: [], hasMore: false };
    return listPaymentMethodsForCustomer(ctx, subscription.customer);
  },
};

/**
 * `stripe:payment_intent_payment_methods` — dep: `paymentIntentId`.
 * Backs `confirm_payment_intent.payment_method`. Two-hop via the
 * intent's customer; a guest / customer-less intent has no saved
 * methods to list, so it honestly returns an empty picker.
 */
export const stripePaymentIntentPaymentMethodsResolver: OptionsResolver = {
  source: "stripe:payment_intent_payment_methods",
  provider: "stripe",
  requiresIntegration: true,
  requiredDeps: ["paymentIntentId"],
  async resolve(ctx) {
    const integration = requireStripeIntegration(ctx);
    const paymentIntentId = requireDep(
      ctx,
      "paymentIntentId",
      "Enter or select a payment intent first.",
    );

    let intent;
    try {
      intent = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "stripe",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          paymentIntentsGet({ accessToken, paymentIntentId }),
      });
    } catch (err) {
      // Intent no longer exists (or the id was mistyped) — empty picker.
      if (err instanceof NotFoundError) return { items: [], hasMore: false };
      mapStripeOptionsError(err, "payment methods");
    }

    // Guest checkout / no customer attached → nothing saved to list.
    if (!intent.customer) return { items: [], hasMore: false };
    return listPaymentMethodsForCustomer(ctx, intent.customer);
  },
};
