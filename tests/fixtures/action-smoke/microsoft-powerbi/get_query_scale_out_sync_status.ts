import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_query_scale_out_sync_status — READ-ONLY replica
 * sync state of the smoke semantic model. Requires a Premium-family
 * capacity; on non-scale-out models the provider rejects the read, so
 * live certification needs a scale-out-enabled smoke model.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_query_scale_out_sync_status",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
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
    "Read-only scale-out sync status. Premium-family capacity required; " +
    "expect a clean provider failure when query scale-out isn't enabled on " +
    "the smoke model.",
});
