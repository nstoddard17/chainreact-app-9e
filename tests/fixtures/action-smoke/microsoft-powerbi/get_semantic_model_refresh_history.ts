import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_semantic_model_refresh_history — READ-ONLY page
 * of the smoke semantic model's refresh history. The output carries only
 * statuses/timestamps/error codes — never model data or the raw
 * serviceExceptionJson.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_semantic_model_refresh_history",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    semanticModelId: "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only refresh history page (top 5) of the smoke model. An empty " +
    "history is still a success (refreshes []).",
});
