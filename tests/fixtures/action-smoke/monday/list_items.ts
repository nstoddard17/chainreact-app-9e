import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_items — read-only board items list (metadata only).
 *
 * Lists items on a given board. Needs a connected Monday account and a board id.
 * The smoke report asserts only the terminal run status — never item content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_items",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  configFromEnv: { boardId: "SMOKE_MONDAY_BOARD_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_BOARD_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday items by board id (metadata, max 10); needs a connected Monday + a board id in SMOKE_MONDAY_BOARD_ID.",
});
