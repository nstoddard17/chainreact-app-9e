import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:add_or_update_pipeline_user — grants pipeline Admin
 * (the only documented right) to the smoke test user. Write, not
 * liveSafe: it changes real access control; owner runs it manually
 * paired with remove_pipeline_user for cleanup.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "add_or_update_pipeline_user",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    principalType: "User",
    accessRight: "Admin",
  },
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
    principalIdentifier: "SMOKE_POWERBI_TEST_USER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
    "SMOKE_POWERBI_TEST_USER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes:
    "Grants pipeline Admin to the smoke test user. Not liveSafe — real access-control change; pair with remove_pipeline_user for cleanup.",
});
