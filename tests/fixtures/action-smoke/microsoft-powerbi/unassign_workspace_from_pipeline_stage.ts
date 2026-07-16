import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:unassign_workspace_from_pipeline_stage — detaches
 * the smoke pipeline stage's workspace. Write, not liveSafe: it mutates
 * shared pipeline state (deploy comparisons break until reassigned);
 * owner runs it manually as the cleanup half of the assign fixture.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "unassign_workspace_from_pipeline_stage",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
    stageOrder: "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
    "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
  ],
  expect: { outcome: "success" },
  notes:
    "Detaches the workspace from the smoke pipeline stage (content untouched). Not liveSafe — mutates shared pipeline linkage; manual cleanup half of the assign fixture.",
});
