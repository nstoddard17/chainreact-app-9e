import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_groups — read-only board groups list (metadata only).
 *
 * Lists the groups on a given board. Needs a connected Monday account and a
 * board id. The smoke report asserts only the terminal run status — never group content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_groups",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { boardId: "SMOKE_MONDAY_BOARD_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_BOARD_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday groups by board id; needs a connected Monday + a board id in SMOKE_MONDAY_BOARD_ID.",
});
