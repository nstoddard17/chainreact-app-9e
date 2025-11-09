/**
 * Stripe Data Handlers Export
 */

import { getStripeCustomers } from './customers'
import { getStripeSubscriptions } from './subscriptions'
import { getStripePaymentIntents } from './paymentIntents'

export const stripeHandlers = {
  'stripe_customers': getStripeCustomers,
  'stripe_subscriptions': getStripeSubscriptions,
  'stripe_payment_intents': getStripePaymentIntents
}

export {
  getStripeCustomers,
  getStripeSubscriptions,
  getStripePaymentIntents
}
