import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_pipeline_deployment_history — pure read of the
 * smoke pipeline's recent deploy operations (provider caps at 20).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_pipeline_deployment_history",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only: lists the smoke pipeline's recent deploy operations. Succeeds with zero operations on a fresh pipeline.",
});
