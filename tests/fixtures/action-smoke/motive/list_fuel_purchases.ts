import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * motive:list_fuel_purchases (read) — MOTIVE-1.
 *
 * Lists one recent page of fuel purchases for the connected Motive company.
 * Read-only, live-safe. SKIPs until `SMOKE_MOTIVE_CONNECTED` is set (Phase 13
 * live certification, after owner setup).
 */
export default defineActionSmokeFixture({
  provider: "motive",
  action: "list_fuel_purchases",
  risk: "read",
  liveRisk: "read",
  liveSafe: true,
  config: { perPage: 5, pageNo: 1 },
  requiredEnv: ["SMOKE_MOTIVE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only fuel list; verifies auth + pagination + bounded output.",
});
