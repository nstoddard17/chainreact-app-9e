import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * quickbooks:list_invoices — QUICKBOOKS-1. One bounded page (newest
 * first, page size 5) with hasMore/nextStartPosition paging outputs. No
 * per-run env ids needed beyond the connection — an empty sandbox
 * company still succeeds with count 0.
 */
export default defineActionSmokeFixture({
  provider: "quickbooks",
  action: "list_invoices",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 5 },
  requiredEnv: ["SMOKE_QUICKBOOKS_CONNECTED"],
  expect: { outcome: "success" },
  notes:
    "Read-only one-page invoice list (pageSize 5) in the connected sandbox company; succeeds even when the company has no invoices.",
});
