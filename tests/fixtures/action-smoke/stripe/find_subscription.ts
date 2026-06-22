import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * stripe:find_subscription — read-only direct Subscription id lookup.
 *
 * `subscriptionId` is overlaid from smoke env. `find` returns
 * `{ found: false, subscription: null }` on 404 rather than throwing, so a
 * stale id still succeeds. Read-only; report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "stripe",
  action: "find_subscription",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { subscriptionId: "SMOKE_STRIPE_SUBSCRIPTION_ID" },
  requiredEnv: ["SMOKE_STRIPE_CONNECTED", "SMOKE_STRIPE_SUBSCRIPTION_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Stripe Subscription id lookup (id from env); 404 still succeeds. SKIPs without Stripe env.",
});
