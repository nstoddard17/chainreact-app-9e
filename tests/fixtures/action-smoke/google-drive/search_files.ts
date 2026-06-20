import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-drive:search_files — read-only, one-page name search (metadata only).
 *
 * Searches Drive file names for SMOKE_GDRIVE_QUERY (overlaid onto config);
 * optionally scoped to SMOKE_GDRIVE_FOLDER_ID when set. The query env is
 * required (no hardcoded literal), so it SKIPs before workflow creation
 * until provided. A query that matches nothing returns an empty page and is
 * still a success. The report asserts only the terminal run status — never
 * file names, links, or the result page.
 */
export default defineActionSmokeFixture({
  provider: "google-drive",
  action: "search_files",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 10 },
  configFromEnv: {
    query: "SMOKE_GDRIVE_QUERY",
    folderId: "SMOKE_GDRIVE_FOLDER_ID",
  },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED", "SMOKE_GDRIVE_QUERY"],
  expect: { outcome: "success" },
  notes:
    "Read-only name search (metadata, one page); needs a connected Google Drive + a query in SMOKE_GDRIVE_QUERY. Optional SMOKE_GDRIVE_FOLDER_ID scopes the search. An empty result page is still a success.",
});
