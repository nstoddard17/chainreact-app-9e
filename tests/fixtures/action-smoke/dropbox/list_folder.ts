import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * dropbox:list_folder — read-only listing of a folder's entries (metadata only).
 * Root path is the empty string, so this runs with just a connection.
 */
export default defineActionSmokeFixture({
  provider: "dropbox",
  action: "list_folder",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { path: "", limit: 10 },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Dropbox folder listing of the root; needs a connected Dropbox.",
});
