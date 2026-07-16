import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:bind_semantic_model_to_gateway — NOT live-safe: it
 * changes which gateway (and stored credentials) the shared smoke
 * model's refreshes flow through, and needs the caller registered as a
 * gateway data source user. Engine test-mode coverage only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "bind_semantic_model_to_gateway",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    semanticModelId: "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
    gatewayId: "SMOKE_POWERBI_GATEWAY_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
    "SMOKE_POWERBI_GATEWAY_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "liveSafe false: rebinding the shared smoke model to a gateway mutates its " +
    "refresh credential path (on-premises gateway only). Certify manually with " +
    "a disposable model + a gateway the caller is a data source user on.",
});
