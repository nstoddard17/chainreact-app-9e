import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:remove_workspace_user — revokes the smoke test
 * user's role on the smoke workspace.
 *
 * Destructive (access revocation) and NEVER liveSafe — a destructive
 * action must not run in workflow-live mode. Used as the manual cleanup
 * pair for the add_workspace_user fixture during owner certification
 * (destructive double-opt-in required).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "remove_workspace_user",
  risk: "destructive",
  liveSafe: false,
  liveRisk: "destructive",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    principalIdentifier: "SMOKE_POWERBI_TEST_USER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_TEST_USER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes:
    "Revokes SMOKE_POWERBI_TEST_USER_EMAIL's role on the smoke workspace — the cleanup pair for add_workspace_user. Fails provider-side if the principal holds no role. Destructive double-opt-in only.",
});
