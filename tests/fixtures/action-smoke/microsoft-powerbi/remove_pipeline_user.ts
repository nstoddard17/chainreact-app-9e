import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:remove_pipeline_user — revokes the smoke test user's
 * pipeline access. Destructive (access removal), never liveSafe; owner
 * runs it manually as the cleanup half of add_or_update_pipeline_user.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "remove_pipeline_user",
  risk: "destructive",
  liveSafe: false,
  liveRisk: "destructive",
  config: {},
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
    "Revokes the smoke test user's pipeline access. Destructive, never liveSafe; manual cleanup half of add_or_update_pipeline_user.",
});
