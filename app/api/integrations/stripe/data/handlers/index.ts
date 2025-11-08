/**
 * Stripe Data Handlers Export
 */

import { getStripeCustomers } from './customers'
import { getStripeSubscriptions } from './subscriptions'

export const stripeHandlers = {
  'stripe_customers': getStripeCustomers,
  'stripe_subscriptions': getStripeSubscriptions
}

export {
  getStripeCustomers,
  getStripeSubscriptions
}
