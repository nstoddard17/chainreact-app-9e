import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:get_customer — QUICKBOOKS-1. Read one customer by id.
 * `found: false` friendly semantics on a stale id (run still succeeds),
 * so live certification pins SMOKE_QUICKBOOKS_CUSTOMER_ID to a real
 * sandbox customer and checks `found: true` in the run output.
 */
export default defineActionSmokeFixture({
  provider: "quickbooks",
  action: "get_customer",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    customerId: "SMOKE_QUICKBOOKS_CUSTOMER_ID",
  },
  requiredEnv: ["SMOKE_QUICKBOOKS_CONNECTED", "SMOKE_QUICKBOOKS_CUSTOMER_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only per-customer GET in the connected sandbox company; needs SMOKE_QUICKBOOKS_CUSTOMER_ID pinned to a real sandbox customer id.",
});
