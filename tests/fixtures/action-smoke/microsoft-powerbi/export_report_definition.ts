import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:export_report_definition — synchronous .pbix
 * definition download staged to V2 storage.
 *
 * risk "write" — a real run creates a storage artifact. Fails
 * provider-side for models with incremental refresh / very large
 * models (documented .pbix download limitations) — the smoke report
 * must be a small, plain-import model. FileRef outputs: NEVER assert
 * file contents.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "export_report_definition",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    reportId: "SMOKE_POWERBI_REPORT_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_REPORT_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Downloads the smoke report's .pbix and stages it to V2 storage. The smoke report must be a small import-mode model (incremental-refresh / very large models fail by design). Do not assert file contents.",
});
