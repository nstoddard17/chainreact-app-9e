import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:get_capacity_assignment_status — pure read of the
 * smoke workspace's latest capacity-assignment operation. Live-safe.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "get_capacity_assignment_status",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only status probe for the smoke workspace's capacity assignment. Succeeds regardless of whether the workspace is on dedicated capacity.",
});
