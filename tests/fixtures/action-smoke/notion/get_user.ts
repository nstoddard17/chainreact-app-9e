import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:get_user — read-only user lookup by id.
 *
 * Id-only contract. userId comes from env. Read-only — the report asserts
 * only the terminal run status, never user details.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "get_user",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { userId: "SMOKE_NOTION_USER_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_USER_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Notion get_user on the smoke user id.",
});
