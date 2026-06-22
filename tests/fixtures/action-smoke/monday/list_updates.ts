import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_updates — read-only updates list for an item (metadata only).
 *
 * Lists updates posted on a given item. Needs a connected Monday account and an
 * item id. The smoke report asserts only the terminal run status — never update content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_updates",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  configFromEnv: { itemId: "SMOKE_MONDAY_ITEM_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_ITEM_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday updates by item id (metadata, max 10); needs a connected Monday + an item id in SMOKE_MONDAY_ITEM_ID.",
});
