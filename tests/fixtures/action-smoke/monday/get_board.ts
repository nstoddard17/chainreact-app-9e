import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:get_board — read-only single board by id (metadata only).
 *
 * Fetches one board by id. Needs a connected Monday account and a board id.
 * The smoke report asserts only the terminal run status — never board content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "get_board",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { boardId: "SMOKE_MONDAY_BOARD_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_BOARD_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday board by id; needs a connected Monday + a board id in SMOKE_MONDAY_BOARD_ID.",
});
