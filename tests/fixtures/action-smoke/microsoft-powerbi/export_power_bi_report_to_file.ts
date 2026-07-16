import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:export_power_bi_report_to_file — full export job
 * (ExportTo → poll → download → stage to V2 storage → FileRef).
 *
 * Live requirements: the smoke workspace must be on Premium / Embedded /
 * Fabric capacity (ExportTo hard-fails on PPU/shared). risk "write"
 * because a real run creates a storage artifact (staged file + metadata
 * row). The report asserts the terminal run status + FileRef shape only
 * — NEVER file contents.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "export_power_bi_report_to_file",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: { format: "PDF" },
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
    "Runs a real ExportTo job (PDF) against the smoke report and stages the file to V2 storage. Requires the smoke workspace on Premium/Embedded/Fabric capacity; the staged artifact expires via the standard workflow-files TTL. Do not assert file contents.",
});
