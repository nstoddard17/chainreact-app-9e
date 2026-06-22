import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_boards — read-only boards list (metadata only).
 *
 * Lists the connected account's boards. Needs only a connected Monday account.
 * The smoke report asserts only the terminal run status — never board content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_boards",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Monday boards list (metadata, max 10); needs only SMOKE_MONDAY_CONNECTED.",
});
