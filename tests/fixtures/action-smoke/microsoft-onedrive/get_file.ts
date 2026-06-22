import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onedrive:get_file — read-only DriveItem metadata fetch (JSON).
 * Returns metadata (id, name, size, mimeType, webUrl, downloadUrl string,
 * timestamps) — does NOT proxy file bytes through the engine.
 *
 * `itemId` auto-discovers via the `microsoft-onedrive:files` resolver (root
 * files first + a bounded one-level folder descent), so no manual selector env
 * is needed when the connected drive has any readable file. `SMOKE_ONEDRIVE_FILE_ID`
 * still PINS a specific file when set (manual override wins over discovery).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onedrive",
  action: "get_file",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { itemId: "SMOKE_ONEDRIVE_FILE_ID" },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only OneDrive DriveItem metadata; itemId auto-discovers a file (or pin SMOKE_ONEDRIVE_FILE_ID).",
});
