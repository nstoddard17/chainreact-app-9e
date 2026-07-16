import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:export_paginated_report_to_file — same ExportTo job
 * pattern against a paginated (RDL) report.
 *
 * Live requirements mirror the Power BI report export fixture (Premium /
 * Embedded / Fabric capacity). risk "write" — a real run creates a
 * storage artifact. FileRef outputs: NEVER assert file contents.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "export_paginated_report_to_file",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: { format: "PDF" },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    paginatedReportId: "SMOKE_POWERBI_PAGINATED_REPORT_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_PAGINATED_REPORT_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Runs a real ExportTo job (PDF) against the smoke paginated report and stages the file to V2 storage. Requires Premium/Embedded/Fabric capacity and a paginated report id in env. Do not assert file contents.",
});
