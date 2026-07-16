import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:assign_workspace_to_pipeline_stage — links a real
 * workspace into the smoke pipeline. Write, not liveSafe: the stage must
 * be unassigned and the workspace pipeline-free, so an automated re-run
 * fails on its own leftover state; owner runs it manually paired with
 * the unassign fixture.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "assign_workspace_to_pipeline_stage",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
    stageOrder: "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
    "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
    "SMOKE_POWERBI_WORKSPACE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Assigns the smoke workspace to the smoke pipeline stage (requires workspace admin + Premium/Fabric capacity). Not liveSafe — stateful precondition (stage unassigned); pair with unassign for cleanup.",
});
