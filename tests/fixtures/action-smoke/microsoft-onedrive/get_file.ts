import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onedrive:get_file — read-only DriveItem metadata fetch (JSON).
 * Returns metadata (id, name, size, mimeType, webUrl, downloadUrl string,
 * timestamps) — does NOT proxy file bytes through the engine.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onedrive",
  action: "get_file",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { itemId: "SMOKE_ONEDRIVE_FILE_ID" },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED", "SMOKE_ONEDRIVE_FILE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only OneDrive DriveItem metadata; needs a connected OneDrive + SMOKE_ONEDRIVE_FILE_ID.",
});
