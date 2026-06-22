import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:get_item — read-only single item by id (metadata only).
 *
 * Fetches one item by id (board id scopes the picker). Needs a connected Monday
 * account, a board id, and an item id. The smoke report asserts only the terminal
 * run status — never item content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "get_item",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    boardId: "SMOKE_MONDAY_BOARD_ID",
    itemId: "SMOKE_MONDAY_ITEM_ID",
  },
  requiredEnv: [
    "SMOKE_MONDAY_CONNECTED",
    "SMOKE_MONDAY_BOARD_ID",
    "SMOKE_MONDAY_ITEM_ID",
  ],
  expect: { outcome: "success" },
  notes: "Read-only Monday item by id; needs a connected Monday + a board id in SMOKE_MONDAY_BOARD_ID and an item id in SMOKE_MONDAY_ITEM_ID.",
});
