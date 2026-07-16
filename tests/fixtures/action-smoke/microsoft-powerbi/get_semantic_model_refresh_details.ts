import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_semantic_model_refresh_details — READ-ONLY
 * execution details of one refresh of the smoke model. Enhanced
 * (API-started) refreshes only — the env id should come from a
 * refresh_semantic_model run with an enhanced option set.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_semantic_model_refresh_details",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    semanticModelId: "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
    refreshRequestId: "SMOKE_POWERBI_REFRESH_REQUEST_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
    "SMOKE_POWERBI_REFRESH_REQUEST_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only refresh execution details. Works only for enhanced (API-started) " +
    "refreshes — set SMOKE_POWERBI_REFRESH_REQUEST_ID from an enhanced " +
    "refresh_semantic_model run.",
});
