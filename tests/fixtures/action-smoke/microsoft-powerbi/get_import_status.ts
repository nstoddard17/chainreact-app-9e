import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_import_status — pure read of one import's state
 * (Publishing | Succeeded | Failed) + produced datasets/reports.
 *
 * liveSafe read against an existing import in the smoke workspace
 * (SMOKE_POWERBI_IMPORT_ID — any past upload's id works; imports are
 * retained provider-side). The report asserts only the terminal run
 * status — never dataset/report names.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_import_status",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    importId: "SMOKE_POWERBI_IMPORT_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_IMPORT_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only: GET /groups/{ws}/imports/{importId} for a pre-existing smoke import. " +
    "Needs a connected Power BI + workspace/import ids in env.",
});
