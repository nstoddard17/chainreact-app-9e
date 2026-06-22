import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:list_users — read-only account users list (metadata only).
 *
 * Lists the connected account's users. Needs only a connected Monday account.
 * The smoke report asserts only the terminal run status — never user content.
 */
export default defineActionSmokeFixture({
  provider: "monday",
  action: "list_users",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10, kind: "all" },
  requiredEnv: ["SMOKE_MONDAY_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Monday users list (metadata, max 10); needs only SMOKE_MONDAY_CONNECTED.",
});
