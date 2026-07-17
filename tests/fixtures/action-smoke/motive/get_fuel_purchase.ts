import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * motive:get_fuel_purchase (read) — MOTIVE-1.
 *
 * Reads one fuel purchase by id. Read-only, live-safe. The id comes from
 * `SMOKE_MOTIVE_FUEL_PURCHASE_ID` (overlaid onto config); SKIPs until both env
 * vars are set (Phase 13 live certification, after owner setup).
 */
export default defineActionSmokeFixture({
  provider: "motive",
  action: "get_fuel_purchase",
  risk: "read",
  liveRisk: "read",
  liveSafe: true,
  config: { fuelPurchaseId: "" },
  configFromEnv: { fuelPurchaseId: "SMOKE_MOTIVE_FUEL_PURCHASE_ID" },
  requiredEnv: ["SMOKE_MOTIVE_CONNECTED", "SMOKE_MOTIVE_FUEL_PURCHASE_ID"],
  expect: { outcome: "success" },
  notes: "Read-back of one fuel purchase; verifies found:true projection + auth.",
});
