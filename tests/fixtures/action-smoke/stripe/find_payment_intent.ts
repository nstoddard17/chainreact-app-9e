import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * stripe:find_payment_intent — read-only direct PaymentIntent id lookup.
 *
 * `paymentIntentId` is overlaid from smoke env. `find` returns
 * `{ found: false, paymentIntent: null }` on 404 rather than throwing, so a
 * stale id still succeeds. Read-only; report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "stripe",
  action: "find_payment_intent",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { paymentIntentId: "SMOKE_STRIPE_PAYMENT_INTENT_ID" },
  requiredEnv: ["SMOKE_STRIPE_CONNECTED", "SMOKE_STRIPE_PAYMENT_INTENT_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Stripe PaymentIntent id lookup (id from env); 404 still succeeds. SKIPs without Stripe env.",
});
