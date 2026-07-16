import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:cancel_semantic_model_refresh — cancels an in-flight
 * ENHANCED refresh of the smoke semantic model.
 *
 * Refresh-adjacent safe write: it only stops a refresh that the smoke
 * run itself started (SMOKE_POWERBI_REFRESH_REQUEST_ID must point at an
 * in-flight enhanced refresh of the smoke model — e.g. one started by
 * the refresh_semantic_model fixture moments before). Canceling a
 * completed/standard refresh fails provider-side, so live certification
 * sequences this after an enhanced refresh start.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "cancel_semantic_model_refresh",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
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
    "Cancels an in-flight ENHANCED refresh of the smoke model. Needs a fresh " +
    "refresh request id in env (start one via refresh_semantic_model with an " +
    "enhanced option first); enhanced-only — standard refreshes reject the cancel.",
});
