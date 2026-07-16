import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:import_power_bi_file — multipart upload of a .pbix
 * into a workspace.
 *
 * liveSafe: false — a live run needs a REAL staged .pbix (a v2_storage
 * FileRef in our workflow-files bucket); there is no self-contained way
 * to synthesize a valid .pbix in the harness. Live certification
 * (Phase 13) stages a tiny known-good smoke .pbix and sets
 * SMOKE_POWERBI_PBIX_STORAGE_PATH to its bucket path; the
 * `{{env.…}}` token below resolves under the write harness. Until then
 * the fixture SKIPs (requiredEnv gate). nameConflict=Abort keeps the
 * upload from ever overwriting an existing dataset.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "import_power_bi_file",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    file: {
      kind: "v2_storage",
      name: "crsmoke-import.pbix",
      mimeType: "application/octet-stream",
      storagePath: "{{env.SMOKE_POWERBI_PBIX_STORAGE_PATH}}",
    },
    datasetDisplayName: "crsmoke-import.pbix",
    nameConflict: "Abort",
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_PBIX_STORAGE_PATH",
  ],
  expect: { outcome: "success" },
  notes:
    "Uploads a staged smoke .pbix (v2_storage FileRef) into the smoke workspace with nameConflict=Abort. " +
    "Not liveSafe: needs a real .pbix staged in the workflow-files bucket " +
    "(SMOKE_POWERBI_PBIX_STORAGE_PATH); creates a dataset/report the certification run must delete.",
});
