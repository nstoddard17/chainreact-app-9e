import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * stripe:find_customer — read-only customer lookup by email.
 *
 * Schema enforces XOR (exactly one of `customerId` / `email`); this fixture uses
 * `email` overlaid from smoke env. `find` returns `{ found: false, customer: null }`
 * on no match rather than throwing, so a non-existent email still succeeds.
 * Read-only; report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "stripe",
  action: "find_customer",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { email: "SMOKE_STRIPE_CUSTOMER_EMAIL" },
  requiredEnv: ["SMOKE_STRIPE_CONNECTED", "SMOKE_STRIPE_CUSTOMER_EMAIL"],
  expect: { outcome: "success" },
  notes: "Read-only Stripe customer lookup by email (XOR field from env); no-match still succeeds. SKIPs without Stripe env.",
});
