import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:add_workspace_user — grants the dedicated smoke test
 * user Viewer on the smoke workspace.
 *
 * NOT liveSafe: grants a real principal access. Pair with the
 * remove_workspace_user fixture for cleanup during owner certification.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "add_workspace_user",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    principalType: "User",
    accessRight: "Viewer",
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    principalEmail: "SMOKE_POWERBI_TEST_USER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_TEST_USER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes:
    "Grants the SMOKE_POWERBI_TEST_USER_EMAIL principal Viewer on the smoke workspace. Real access grant — certification-run only; clean up via the remove_workspace_user fixture. Fails provider-side if the user already holds a role.",
});
