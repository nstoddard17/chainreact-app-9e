import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_semantic_model_datasources — NOT live-safe:
 * it re-points the shared smoke model's data-source connections (the
 * next refresh would load from the new target) and requires ownership.
 * Engine test-mode coverage only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_semantic_model_datasources",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    updates: [
      {
        datasourceType: "Sql",
        currentServer: "smoke-old-server",
        currentDatabase: "smoke-db",
        newServer: "smoke-new-server",
        newDatabase: "smoke-db",
      },
    ],
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
    "liveSafe false: rewires the shared smoke model's data-source connections " +
    "and needs caller ownership; same-schema source required. Certify manually " +
    "against a disposable model with a matching SQL source.",
});
