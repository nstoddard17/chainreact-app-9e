import Stripe from "stripe"

let stripeInstance: Stripe | null = null

/**
 * Lazy-initialized Stripe client.
 * Avoids module-level initialization that breaks `next build`
 * when STRIPE_CLIENT_SECRET is not set (e.g., in CI).
 */
export function getStripeClient(apiVersion?: string): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_CLIENT_SECRET) {
      throw new Error("STRIPE_CLIENT_SECRET environment variable is not set")
    }
    stripeInstance = new Stripe(process.env.STRIPE_CLIENT_SECRET, {
      apiVersion: (apiVersion as Stripe.LatestApiVersion) || "2025-05-28.basil",
      typescript: true,
    })
  }
  return stripeInstance
}
