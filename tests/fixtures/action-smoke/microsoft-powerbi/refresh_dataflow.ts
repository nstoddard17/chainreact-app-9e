import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:refresh_dataflow — starts an on-demand refresh of
 * the dedicated smoke dataflow (NoNotification — nobody is emailed).
 *
 * liveSafe write: env-gated to a dedicated smoke dataflow
 * (SMOKE_POWERBI_DATAFLOW_ID); consumes that dataflow's refresh quota
 * only. The API returns no refresh id — the run output is
 * {started, dataflowId}; completion (if needed) is observed via
 * get_dataflow_refresh_history.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "refresh_dataflow",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: { notifyOption: "NoNotification" },
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
    "Starts a real refresh of the smoke dataflow (NoNotification). Consumes refresh quota; " +
    "needs a connected Power BI + workspace/dataflow ids in env.",
});
