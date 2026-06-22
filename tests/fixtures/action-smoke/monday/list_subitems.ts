import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_subitems — read-only subitems list for a parent item (metadata only).
 *
 * Lists subitems of a given parent item. Needs a connected Monday account and a
 * parent item id. The smoke report asserts only the terminal run status — never content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_subitems",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { parentItemId: "SMOKE_MONDAY_PARENT_ITEM_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_PARENT_ITEM_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday subitems by parent item id; needs a connected Monday + a parent item id in SMOKE_MONDAY_PARENT_ITEM_ID.",
});
