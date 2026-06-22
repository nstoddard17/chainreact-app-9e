import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * dropbox:get_file_metadata — pure read of a file/folder's metadata at `path`.
 */
export default defineActionSmokeFixture({
  provider: "dropbox",
  action: "get_file_metadata",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { path: "SMOKE_DROPBOX_FILE_PATH" },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED", "SMOKE_DROPBOX_FILE_PATH"],
  expect: { outcome: "success" },
  notes: "Read-only Dropbox file metadata; needs a connected Dropbox + SMOKE_DROPBOX_FILE_PATH.",
});
