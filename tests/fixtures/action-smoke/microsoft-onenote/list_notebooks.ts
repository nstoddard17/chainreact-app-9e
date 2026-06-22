import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:list_notebooks — read-only notebook list (metadata only).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "list_notebooks",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only OneNote notebook list (metadata); needs only SMOKE_MICROSOFT_ONENOTE_CONNECTED.",
});
