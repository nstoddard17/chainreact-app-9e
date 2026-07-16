import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:clone_report — clones the smoke report in-place
 * (same workspace, same model).
 *
 * Creates a REAL report named with the crsmoke marker — there is no
 * delete_report action registered in this catalog, so CLEANUP IS
 * MANUAL: remove "crsmoke-clone-report" clones from the smoke
 * workspace after a live pass. Needs the Content.Create permission on
 * the connected user.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "clone_report",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: { newReportName: "crsmoke-clone-report" },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    reportId: "SMOKE_POWERBI_REPORT_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_REPORT_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Creates a real report clone named crsmoke-clone-report in the smoke workspace. No delete_report action exists in the catalog — cleanup is MANUAL (delete marker-named clones from the workspace after the run).",
});
