import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:get_file_info — read-only file metadata lookup (files.info).
 *
 * Needs a Slack file id (F…) in SMOKE_SLACK_FILE_ID (overlaid onto config).
 * SKIPs before workflow creation when it's missing (inventory/handler coverage
 * until you provide a real file id). Read-only — the report asserts only the
 * terminal run status, never the file metadata or any URL.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "get_file_info",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { fileId: "SMOKE_SLACK_FILE_ID" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_FILE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only files.info; needs a Slack file id (F…) in SMOKE_SLACK_FILE_ID.",
});
