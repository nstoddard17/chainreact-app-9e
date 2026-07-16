import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_dataflow_refresh_history — pure read of the
 * smoke dataflow's refresh transactions (newest first, bounded page).
 *
 * liveSafe read; asserts only the terminal run status — never
 * transaction contents.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_dataflow_refresh_history",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    dataflowId: "SMOKE_POWERBI_DATAFLOW_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_DATAFLOW_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only: GET /groups/{ws}/dataflows/{df}/transactions (top 5, client-side bound). " +
    "Needs a connected Power BI + workspace/dataflow ids in env.",
});
