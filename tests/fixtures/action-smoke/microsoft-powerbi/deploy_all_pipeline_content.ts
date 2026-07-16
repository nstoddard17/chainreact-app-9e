import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:deploy_all_pipeline_content — starts an async Deploy
 * All. Overwrites the target stage's content (destructive) — NEVER runs
 * live; live certification is a manual owner-run against a dedicated
 * smoke pipeline. Purge stays off.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "deploy_all_pipeline_content",
  risk: "destructive",
  liveSafe: false,
  liveRisk: "destructive",
  config: {
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
    "Deploys ALL content from the smoke pipeline's source stage — overwrites the target stage. Destructive, never liveSafe; allowPurgeData deliberately unset.",
});
