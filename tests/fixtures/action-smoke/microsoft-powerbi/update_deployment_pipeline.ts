import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_deployment_pipeline — rewrites the smoke
 * pipeline's DESCRIPTION only (never the name, so the pipeline stays
 * findable). Recoverable metadata write against the dedicated smoke
 * pipeline → liveSafe.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_deployment_pipeline",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: {
    description:
      "ChainReact action-smoke fixture: description touched by update_deployment_pipeline. Safe to ignore.",
  },
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Rewrites the smoke pipeline's description (name untouched). Recoverable metadata-only write on the dedicated smoke pipeline; no cleanup needed.",
});
