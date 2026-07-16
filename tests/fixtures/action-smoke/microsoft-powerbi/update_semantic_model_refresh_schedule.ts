import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_semantic_model_refresh_schedule — NOT
 * live-safe: it rewrites the shared smoke model's scheduled-refresh
 * configuration (days/times/notification) and requires ownership.
 * Engine test-mode coverage only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_semantic_model_refresh_schedule",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    enabled: true,
    days: ["Monday"],
    times: ["07:00"],
    localTimeZoneId: "UTC",
    notifyOption: "NoNotification",
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    semanticModelId: "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_SEMANTIC_MODEL_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "liveSafe false: mutates the shared smoke model's refresh schedule (a " +
    "durable config other runs depend on) and needs caller ownership. Certify " +
    "manually against a disposable model.",
});
