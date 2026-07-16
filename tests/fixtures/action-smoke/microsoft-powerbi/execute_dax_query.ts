import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:execute_dax_query — evaluates a constant DAX row
 * against the smoke semantic model (no model data touched, nothing
 * mutated). Requires Build permission on the model and the tenant's
 * "Dataset Execute Queries REST API" setting.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "execute_dax_query",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {
    daxQuery: 'EVALUATE ROW("SmokeCheck", 1)',
    maxRows: 5,
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
    "Constant-row DAX evaluation (EVALUATE ROW) — reads nothing from the model " +
    "and mutates nothing. Fails cleanly if the tenant's Execute Queries setting " +
    "is off or Build permission is missing.",
});
