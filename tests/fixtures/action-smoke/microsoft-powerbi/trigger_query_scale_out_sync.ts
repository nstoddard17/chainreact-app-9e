import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:trigger_query_scale_out_sync — NOT live-safe by
 * default: it consumes Premium capacity resources to re-sync the model's
 * read replicas, and requires query scale-out to be enabled on the smoke
 * model (Premium-family capacity). Engine test-mode coverage only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "trigger_query_scale_out_sync",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
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
    "liveSafe false: needs a Premium-family capacity with query scale-out " +
    "enabled on the smoke model and consumes capacity to re-sync replicas. " +
    "Certify manually once a scale-out-enabled smoke model exists.",
});
