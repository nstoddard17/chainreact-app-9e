import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_dataflow_refresh_schedule — PATCHes the
 * smoke dataflow's scheduled-refresh settings.
 *
 * liveSafe: false — the schedule is a PERSISTENT provider-side setting
 * with no read-back action shipped in this domain and no automatic
 * restore of the prior schedule; a live run would leave the smoke
 * dataflow's schedule mutated. Phase 13 certifies it manually
 * (set → inspect in the Power BI UI → restore). The config keeps the
 * schedule disabled with no notification so an accidental live run is
 * as inert as possible.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_dataflow_refresh_schedule",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    enabled: false,
    notifyOption: "NoNotification",
  },
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
    "PATCHes the smoke dataflow's refresh schedule (disabled + NoNotification — most inert values). " +
    "Not liveSafe: persistent setting with no read-back/restore path; Phase 13 certifies manually.",
});
