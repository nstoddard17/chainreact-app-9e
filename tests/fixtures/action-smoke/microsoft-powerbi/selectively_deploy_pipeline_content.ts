import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:selectively_deploy_pipeline_content — starts an async
 * selective deploy. Overwrites the selected items in the target stage
 * (destructive) — NEVER runs live. The semantic-model id is a literal
 * placeholder (configFromEnv only injects strings; the schema needs an
 * array) — fine for a never-live fixture; a manual live run replaces it
 * with a real smoke-stage artifact id.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "selectively_deploy_pipeline_content",
  risk: "destructive",
  liveSafe: false,
  liveRisk: "destructive",
  config: {
    semanticModelIds: ["00000000-0000-0000-0000-000000000001"],
    allowCreateArtifact: true,
    allowOverwriteArtifact: true,
  },
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
    sourceStageOrder: "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
    "SMOKE_POWERBI_PIPELINE_STAGE_ORDER",
  ],
  expect: { outcome: "success" },
  notes:
    "Selectively deploys one semantic model from the smoke pipeline's source stage — overwrites it in the target stage. Destructive, never liveSafe; placeholder artifact id.",
});
