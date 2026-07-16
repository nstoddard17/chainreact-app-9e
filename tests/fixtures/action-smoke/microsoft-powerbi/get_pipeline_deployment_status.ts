import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_pipeline_deployment_status — pure read of one
 * pipeline operation. Needs a real past operation id from the smoke
 * pipeline's history; SKIPs until provided. The report asserts only the
 * run status — never operation payloads.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_pipeline_deployment_status",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    pipelineId: "SMOKE_POWERBI_PIPELINE_ID",
    operationId: "SMOKE_POWERBI_PIPELINE_OPERATION_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_PIPELINE_ID",
    "SMOKE_POWERBI_PIPELINE_OPERATION_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only: fetches one deploy operation of the smoke pipeline. Needs a real past operation id in env (take one from get_pipeline_deployment_history).",
});
