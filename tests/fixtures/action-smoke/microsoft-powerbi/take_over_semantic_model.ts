import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:take_over_semantic_model — takes ownership of the
 * DEDICATED smoke semantic model. Live-safe write: the smoke model
 * exists for this connection, so ownership landing on the smoke user is
 * the intended steady state (idempotent when already owner).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "take_over_semantic_model",
  risk: "write",
  liveSafe: true,
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
    "Transfers ownership of the dedicated smoke model to the smoke connection " +
    "(idempotent when already owner). Scheduled refresh switches to the smoke " +
    "user's credentials — acceptable on the smoke model only.",
});
