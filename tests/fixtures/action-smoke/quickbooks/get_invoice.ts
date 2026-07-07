import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:get_invoice — QUICKBOOKS-1. Read one invoice by id with
 * balance + paid state. `found: false` friendly semantics on a stale id
 * (run still succeeds), so live certification pins
 * SMOKE_QUICKBOOKS_INVOICE_ID to a real sandbox invoice and checks
 * `found: true` in the run output.
 */
export default defineActionSmokeFixture({
  provider: "quickbooks",
  action: "get_invoice",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    invoiceId: "SMOKE_QUICKBOOKS_INVOICE_ID",
  },
  requiredEnv: ["SMOKE_QUICKBOOKS_CONNECTED", "SMOKE_QUICKBOOKS_INVOICE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only per-invoice GET in the connected sandbox company; needs SMOKE_QUICKBOOKS_INVOICE_ID pinned to a real sandbox invoice id.",
});
