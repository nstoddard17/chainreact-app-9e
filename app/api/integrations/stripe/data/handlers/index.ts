/**
 * Stripe Data Handlers Export
 */

import { getStripeCustomers } from './customers'
import { getStripeSubscriptions } from './subscriptions'
import { getStripePaymentIntents } from './paymentIntents'
import { getStripePrices } from './prices'
import { getStripePaymentMethods } from './paymentMethods'

export const stripeHandlers = {
  'stripe_customers': getStripeCustomers,
  'stripe_subscriptions': getStripeSubscriptions,
  'stripe_payment_intents': getStripePaymentIntents,
  'stripe_prices': getStripePrices,
  'stripe_payment_methods': getStripePaymentMethods
}

export {
  getStripeCustomers,
  getStripeSubscriptions,
  getStripePaymentIntents,
  getStripePrices,
  getStripePaymentMethods
}
