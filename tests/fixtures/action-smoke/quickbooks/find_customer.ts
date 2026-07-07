import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:find_customer — QUICKBOOKS-1. Read-only exact-match search
 * on ONE field (QBO's query language has no OR). Success = the run
 * succeeds; an unknown name still succeeds with `found: false`
 * (friendly not-found — never a thrown error), so live certification
 * pins SMOKE_QUICKBOOKS_CUSTOMER_NAME to a real sandbox customer's
 * display name and checks `found: true` in the run output.
 */
export default defineActionSmokeFixture({
  provider: "quickbooks",
  action: "find_customer",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { searchBy: "displayName" },
  configFromEnv: {
    value: "SMOKE_QUICKBOOKS_CUSTOMER_NAME",
  },
  requiredEnv: [
    "SMOKE_QUICKBOOKS_CONNECTED",
    "SMOKE_QUICKBOOKS_CUSTOMER_NAME",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only exact display-name search in the connected sandbox company; needs a connected QuickBooks (owner setup: Intuit app + sandbox company) and SMOKE_QUICKBOOKS_CUSTOMER_NAME pinned to a real customer.",
});
