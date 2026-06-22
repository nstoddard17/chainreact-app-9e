import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * stripe:get_payments — read-only payment (charge) list (one small page).
 *
 * No resource selector — lists charges with a small literal `limit`. Read-only;
 * report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "stripe",
  action: "get_payments",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  requiredEnv: ["SMOKE_STRIPE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Stripe payments (charges) list (one page, max 10); needs only SMOKE_STRIPE_CONNECTED.",
});
