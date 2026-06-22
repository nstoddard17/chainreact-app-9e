import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * dropbox:search_files — read-only file name search (metadata only).
 */
export default defineActionSmokeFixture({
  provider: "dropbox",
  action: "search_files",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { maxResults: 10 },
  configFromEnv: { query: "SMOKE_DROPBOX_QUERY" },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED", "SMOKE_DROPBOX_QUERY"],
  expect: { outcome: "success" },
  notes: "Read-only Dropbox search (metadata); needs a connected Dropbox + SMOKE_DROPBOX_QUERY.",
});
