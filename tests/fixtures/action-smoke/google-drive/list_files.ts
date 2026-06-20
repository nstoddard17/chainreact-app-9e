import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-drive:list_files — read-only Drive file listing (metadata only).
 *
 * Lists across My Drive (no folder filter, trashed excluded by schema default).
 * Needs only a connected Google Drive account. The report asserts only the
 * terminal run status — never file names, ids, or links.
 */
export default defineActionSmokeFixture({
  provider: "google-drive",
  action: "list_files",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 25 },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Drive list (metadata); needs only SMOKE_GOOGLE_DRIVE_CONNECTED.",
});
