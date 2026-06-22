import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:search_items — read-only item name search within a board (metadata only).
 *
 * Searches items on a board by name substring. Needs a connected Monday account,
 * a board id, and a search value. The smoke report asserts only the terminal run
 * status — never item content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "search_items",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  configFromEnv: {
    boardId: "SMOKE_MONDAY_BOARD_ID",
    columnValue: "SMOKE_MONDAY_QUERY",
  },
  requiredEnv: [
    "SMOKE_MONDAY_CONNECTED",
    "SMOKE_MONDAY_BOARD_ID",
    "SMOKE_MONDAY_QUERY",
  ],
  expect: { outcome: "success" },
  notes: "Read-only Monday item search by name (metadata, max 10); needs a connected Monday + a board id in SMOKE_MONDAY_BOARD_ID and a search value in SMOKE_MONDAY_QUERY.",
});
