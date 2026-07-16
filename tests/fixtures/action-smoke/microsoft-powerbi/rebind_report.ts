import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:rebind_report — LIVE-UNSAFE by default.
 *
 * Rebinding permanently changes which semantic model backs a shared
 * report (and a live-connection report becomes direct-bound — not
 * reversible by rebinding back). Never run live against anything but a
 * dedicated throwaway report; liveSafe stays false.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "rebind_report",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    reportId: "SMOKE_POWERBI_REPORT_ID",
    semanticModelId: "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_REPORT_ID",
    "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Mutates shared report config: repoints the report at another semantic model, and live-connection reports become direct-bound irreversibly. liveSafe false — certify manually against a throwaway report only.",
});
