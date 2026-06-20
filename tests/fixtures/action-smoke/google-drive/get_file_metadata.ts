import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-drive:get_file_metadata — read-only single-file metadata.
 *
 * Reads one file's bounded metadata (name/type/size/timestamps/view link).
 * The file id comes from SMOKE_GDRIVE_FILE_ID (overlaid onto config), so it
 * SKIPs before workflow creation until a real file id is provided. Read-only,
 * metadata-only (no content download). The report asserts only the terminal
 * run status — never file names, links, or metadata.
 */
export default defineActionSmokeFixture({
  provider: "google-drive",
  action: "get_file_metadata",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { fileId: "SMOKE_GDRIVE_FILE_ID" },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED", "SMOKE_GDRIVE_FILE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only single-file metadata; needs a connected Google Drive + a real file id in SMOKE_GDRIVE_FILE_ID.",
});
