import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:cancel_dataflow_refresh — cancels an in-flight
 * dataflow refresh transaction.
 *
 * liveSafe: false — a meaningful live run needs an IN-FLIGHT refresh
 * transaction (start refresh_dataflow, list transactions, cancel the
 * InProgress one), which is a sequenced certification scenario rather
 * than a standalone fixture. SMOKE_POWERBI_DATAFLOW_TRANSACTION_ID is
 * the manual escape hatch for Phase 13 (paste a live transaction id);
 * absent env → SKIP.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "cancel_dataflow_refresh",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    dataflowId: "SMOKE_POWERBI_DATAFLOW_ID",
    transactionId: "SMOKE_POWERBI_DATAFLOW_TRANSACTION_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_DATAFLOW_ID",
    "SMOKE_POWERBI_DATAFLOW_TRANSACTION_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Cancels a dataflow refresh transaction. Not liveSafe: needs an in-flight transaction " +
    "(refresh_dataflow → history → cancel is the Phase-13 sequenced scenario).",
});
