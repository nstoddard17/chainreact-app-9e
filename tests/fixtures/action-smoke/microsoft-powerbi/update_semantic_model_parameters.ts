import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_semantic_model_parameters — NOT live-safe:
 * it mutates a shared model's Power Query parameters (which drive where
 * the next refresh loads data from) and requires ownership of the model.
 * Engine test-mode coverage only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_semantic_model_parameters",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    parameters: [{ name: "SmokeParameter", newValue: "smoke-value" }],
  },
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
    "liveSafe false: rewrites the shared smoke model's query parameters and " +
    "needs caller ownership (Take Over). Certify manually against a disposable " +
    "model with a real 'SmokeParameter' parameter.",
});
