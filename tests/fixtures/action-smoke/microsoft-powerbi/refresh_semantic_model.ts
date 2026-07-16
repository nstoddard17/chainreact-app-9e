import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:refresh_semantic_model — starts an on-demand refresh.
 *
 * Consumes the model's refresh quota (8/day on shared capacity), so the
 * live fixture targets a dedicated smoke semantic model. Workspace +
 * model ids come from env; SKIPs until provided. The report asserts only
 * the terminal run status + a non-empty refreshRequestId — never model
 * names or data.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "refresh_semantic_model",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: { notifyOption: "NoNotification" },
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
    "Starts a real refresh of the smoke semantic model (NoNotification). Consumes refresh quota; needs a connected Power BI + workspace/model ids in env.",
});
