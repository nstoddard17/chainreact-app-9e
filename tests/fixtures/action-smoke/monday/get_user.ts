import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:get_user — read-only single user by id (metadata only).
 *
 * Fetches one Monday user by id. Needs a connected Monday account and a user id.
 * The smoke report asserts only the terminal run status — never user content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "get_user",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { userId: "SMOKE_MONDAY_USER_ID" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED", "SMOKE_MONDAY_USER_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Monday user by id; needs a connected Monday + a user id in SMOKE_MONDAY_USER_ID.",
});
